package manga

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
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
	for {
		_, _ = s.Tidy()
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
}

func (s *Service) view() view {
	if s == nil {
		return view{Series: []Report{}}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	v := view{On: true, Library: s.Lib.Library, Raw: s.Lib.RawRoot, Engine: s.Engine, Error: s.err, Series: s.last}
	if v.Series == nil {
		v.Series = []Report{}
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
}

func writeView(w http.ResponseWriter, v view) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
