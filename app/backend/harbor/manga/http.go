package manga

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Environment switches, set by Harbor's installer.
const (
	// DirEnv is the tidy manga folder inside the container, for example /manga.
	// Without it the manga lane is off.
	DirEnv = "HARBOR_MANGA_DIR"
	// RawEnv is where the engine saves; the default is "engine-trial" inside DirEnv.
	RawEnv = "HARBOR_MANGA_RAW"
	// EngineEnv is the engine's address, for example http://192.168.1.105:4567.
	EngineEnv = "HARBOR_MANGA_ENGINE"
)

// Service runs the librarian for Harbor's manga pages.
type Service struct {
	Lib    Librarian
	Engine string

	fmu     sync.Mutex // guards the followed list on disk
	askMu   sync.Mutex // one round of Glowfin's asks at a time
	mu      sync.Mutex
	running bool
	last    []Report
	at      time.Time
	err     string
}

// FromEnv builds the service from the environment; nil when manga is off.
func FromEnv() *Service {
	dir := strings.TrimSpace(os.Getenv(DirEnv))
	if dir == "" {
		return nil
	}
	raw := strings.TrimSpace(os.Getenv(RawEnv))
	if raw == "" {
		raw = filepath.Join(dir, "engine-trial")
	}
	return &Service{Lib: Librarian{Library: dir, RawRoot: raw, Rules: DefaultRules()}, Engine: strings.TrimRight(strings.TrimSpace(os.Getenv(EngineEnv)), "/")}
}

// Tidy runs the librarian once. A second call while one is running waits
// for it and shares its result.
func (s *Service) Tidy() ([]Report, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.fmu.Lock()
	followed := s.Lib.loadFollowed()
	s.Lib.Aliases, s.Lib.Info = aliases(followed), infoFor(followed)
	s.fmu.Unlock()
	reps, err := s.Lib.TidyAll()
	s.at = time.Now()
	if err != nil {
		s.err = err.Error()
		return s.last, err
	}
	s.last, s.err = reps, ""
	return reps, nil
}

// Run tidies now and then every few minutes until ctx ends, so chapters the
// engine brings in overnight are shelved without anyone pressing a button.
func (s *Service) Run(ctx context.Context) {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	var checked time.Time
	for {
		_, _ = s.Tidy()
		s.dressFollowed(ctx)
		// Manga asked for in Glowfin (Requests > Manga) and approved by Ben
		go s.HandleAsks(ctx)
		// New chapters: ask the sites four times a day, no more.
		if time.Since(checked) >= 6*time.Hour {
			checked = time.Now()
			go s.CheckFollowed(ctx)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

type view struct {
	On      bool     `json:"on"`
	Library string   `json:"library,omitempty"`
	Raw     string   `json:"raw,omitempty"`
	Engine  string   `json:"engine,omitempty"`
	Tidied  string   `json:"tidied,omitempty"`
	Error   string   `json:"error,omitempty"`
	Series  []Report `json:"series"`
	// Following is the titles Harbor keeps up with by itself.
	Following []Followed `json:"following"`
}

func (s *Service) view() view {
	if s == nil {
		return view{Series: []Report{}, Following: []Followed{}}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	v := view{On: true, Library: s.Lib.Library, Raw: s.Lib.RawRoot, Engine: s.Engine, Error: s.err, Series: s.last}
	if v.Series == nil {
		v.Series = []Report{}
	}
	s.fmu.Lock()
	v.Following = s.Lib.loadFollowed()
	s.fmu.Unlock()
	if v.Following == nil {
		v.Following = []Followed{}
	}
	if !s.at.IsZero() {
		v.Tidied = s.at.UTC().Format(time.RFC3339)
	}
	return v
}

// Routes registers Harbor's manga routes. They are not in the route table,
// so they are for the owner only.
func (s *Service) Routes(m *http.ServeMux) {
	m.HandleFunc("GET /api/v1/harbor/manga", func(w http.ResponseWriter, r *http.Request) { writeView(w, s.view()) })
	m.HandleFunc("POST /api/v1/harbor/manga/tidy", func(w http.ResponseWriter, r *http.Request) {
		if s != nil {
			_, _ = s.Tidy()
		}
		writeView(w, s.view())
	})
	s.engineRoutes(m)
}

// engineRoutes are the routes that ask the manga engine for something.
func (s *Service) engineRoutes(m *http.ServeMux) {
	off := func(w http.ResponseWriter) bool {
		if s == nil || s.Engine == "" {
			writeJSON2(w, http.StatusServiceUnavailable, map[string]string{"error": "The manga engine is not connected to Harbor yet."})
			return true
		}
		return false
	}
	m.HandleFunc("GET /api/v1/harbor/manga/search", func(w http.ResponseWriter, r *http.Request) {
		if off(w) {
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if len(q) < 2 {
			writeJSON2(w, http.StatusOK, SearchResult{Hits: []Hit{}, Failed: []string{}})
			return
		}
		s.fmu.Lock()
		rules := s.Lib.loadSiteRules()
		s.fmu.Unlock()
		res, err := Engine{URL: s.Engine}.Search(r.Context(), q, rules)
		if err != nil {
			writeJSON2(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON2(w, http.StatusOK, res)
	})
	m.HandleFunc("POST /api/v1/harbor/manga/get", func(w http.ResponseWriter, r *http.Request) {
		if off(w) {
			return
		}
		var in struct {
			Title string  `json:"title"`
			On    []Found `json:"on"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil || strings.TrimSpace(in.Title) == "" || len(in.On) == 0 {
			writeJSON2(w, http.StatusBadRequest, map[string]string{"error": "Pick a title first."})
			return
		}
		if len(in.On) > 8 {
			in.On = in.On[:8]
		}
		// The sites can be slow; do not stop half way if the page is closed.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 3*time.Minute)
		defer cancel()
		writeJSON2(w, http.StatusOK, s.Get(ctx, in.Title, in.On))
	})
	m.HandleFunc("POST /api/v1/harbor/manga/check", func(w http.ResponseWriter, r *http.Request) {
		if off(w) {
			return
		}
		var in struct {
			Title string `json:"title"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil || strings.TrimSpace(in.Title) == "" {
			writeJSON2(w, http.StatusBadRequest, map[string]string{"error": "Pick a title first."})
			return
		}
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 3*time.Minute)
		defer cancel()
		res, ok := s.Check(ctx, in.Title)
		if !ok {
			writeJSON2(w, http.StatusNotFound, map[string]string{"error": "Harbor is not keeping up with that title."})
			return
		}
		writeJSON2(w, http.StatusOK, res)
	})
	m.HandleFunc("DELETE /api/v1/harbor/manga/follow", func(w http.ResponseWriter, r *http.Request) {
		if s == nil {
			http.NotFound(w, r)
			return
		}
		ok, err := s.Unfollow(r.URL.Query().Get("title"))
		if err != nil {
			writeJSON2(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if !ok {
			writeJSON2(w, http.StatusNotFound, map[string]string{"error": "Harbor is not keeping up with that title."})
			return
		}
		writeView(w, s.view())
	})
	m.HandleFunc("GET /api/v1/harbor/manga/sites", func(w http.ResponseWriter, r *http.Request) {
		if off(w) {
			return
		}
		v, err := s.Sites(r.Context())
		if err != nil {
			writeJSON2(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON2(w, http.StatusOK, v)
	})
	m.HandleFunc("PUT /api/v1/harbor/manga/sites", func(w http.ResponseWriter, r *http.Request) {
		if off(w) {
			return
		}
		var in SiteRules
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil {
			writeJSON2(w, http.StatusBadRequest, map[string]string{"error": "Harbor could not read those rules."})
			return
		}
		s.fmu.Lock()
		err := s.Lib.saveSiteRules(in)
		s.fmu.Unlock()
		if err != nil {
			writeJSON2(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		v, err := s.Sites(r.Context())
		if err != nil {
			writeJSON2(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON2(w, http.StatusOK, v)
	})
	m.HandleFunc("GET /api/v1/harbor/manga/cover", func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(r.URL.Query().Get("id"))
		if s == nil || s.Engine == "" || err != nil || id < 0 {
			http.NotFound(w, r)
			return
		}
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, s.Engine+"/api/v1/manga/"+strconv.Itoa(id)+"/thumbnail", nil)
		res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer res.Body.Close()
		ct := res.Header.Get("Content-Type")
		if res.StatusCode != http.StatusOK || !strings.HasPrefix(ct, "image/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_, _ = io.Copy(w, io.LimitReader(res.Body, 8<<20))
	})
	m.HandleFunc("GET /api/v1/harbor/manga/queue", func(w http.ResponseWriter, r *http.Request) {
		if off(w) {
			return
		}
		q, err := Engine{URL: s.Engine}.Queue(r.Context())
		if err != nil {
			writeJSON2(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON2(w, http.StatusOK, q)
	})
}

func writeJSON2(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeView(w http.ResponseWriter, v view) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
