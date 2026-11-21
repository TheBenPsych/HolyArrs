package manga

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Followed is one title Harbor keeps up with: the name it goes by on the
// shelf and each site's copy of it.
type Followed struct {
	Title string  `json:"title"`
	On    []Found `json:"on"`
	Since string  `json:"since,omitempty"`
	// Last is what the last check found.
	Checked string `json:"checked,omitempty"`
	Total   int    `json:"total,omitempty"`
	Note    string `json:"note,omitempty"`
	// Dressed is set once Harbor has tried to fetch the cover and story.
	Dressed bool  `json:"dressed,omitempty"`
	Covered bool  `json:"covered,omitempty"`
	Info    *Info `json:"info,omitempty"`
}

// followFile is Harbor's own list inside the manga folder. The folder name
// starts with a dot so readers of the shelf skip it.
func (l Librarian) followFile() string { return filepath.Join(l.Library, ".harbor", "following.json") }

func (l Librarian) loadFollowed() []Followed {
	var out []Followed
	b, err := os.ReadFile(l.followFile())
	if err != nil {
		return nil
	}
	_ = json.Unmarshal(b, &out)
	return out
}

func (l Librarian) saveFollowed(list []Followed) error {
	p := l.followFile()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(list, "", "  ")
	tmp := p + ".part"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// aliases maps every site's spelling of a followed title to the one shelf
// name, so "Kage no Jitsuryokusha" from one site and "The Eminence in
// Shadow" from another land in one folder.
func aliases(list []Followed) map[string]string {
	m := map[string]string{}
	for _, f := range list {
		for _, o := range f.On {
			if k := TitleKey(o.Title); k != "" && o.Title != f.Title {
				m[k] = f.Title
			}
		}
	}
	return m
}

// shelfHave reads which chapter numbers of a title are already on the shelf.
func (l Librarian) shelfHave(title string) map[string]bool {
	have := map[string]bool{}
	sf := readSeries(filepath.Join(l.Library, SafeName(title), "series.json"))
	for _, c := range sf.Chapters {
		have[numKey(c.Number)] = true
	}
	return have
}

// GetResult says what Harbor queued for a title.
type GetResult struct {
	Title  string         `json:"title"`
	Queued int            `json:"queued"`
	Have   int            `json:"have"`
	Total  int            `json:"total"`
	BySite map[string]int `json:"by_site"`
	Failed []string       `json:"failed"`
	Error  string         `json:"error,omitempty"`
}

// get reads the chapter list of every site's copy, chooses one copy of each
// chapter and queues what the shelf does not have.
func (s *Service) get(ctx context.Context, f Followed) GetResult {
	res := GetResult{Title: f.Title, BySite: map[string]int{}, Failed: []string{}}
	e := Engine{URL: s.Engine}
	s.fmu.Lock()
	rules := s.Lib.loadSiteRules()
	s.fmu.Unlock()
	// Leave out copies on sites the owner has since switched off. Copies
	// saved before sites had ids are kept.
	var on []Found
	for _, o := range f.On {
		if ok, _ := rules.Allows(Site{ID: o.SiteID, Name: o.Site, Lang: "en"}); ok || o.SiteID == "" {
			on = append(on, o)
		}
	}
	f.On = on
	opts := make([]Option, len(f.On))
	errs := make([]error, len(f.On))
	var wg sync.WaitGroup
	for i, o := range f.On {
		wg.Add(1)
		go func(i int, o Found) {
			defer wg.Done()
			c, cancel := context.WithTimeout(ctx, 60*time.Second)
			defer cancel()
			chs, err := e.Chapters(c, o.ID)
			opts[i], errs[i] = Option{MangaID: o.ID, Site: o.Site, Chapters: chs, Rank: rules.Rank(o.SiteID)}, err
		}(i, o)
	}
	wg.Wait()
	var good []Option
	for i, err := range errs {
		if err != nil {
			res.Failed = append(res.Failed, f.On[i].Site)
			if res.Error == "" {
				res.Error = err.Error()
			}
			continue
		}
		good = append(good, opts[i])
	}
	if len(good) == 0 {
		return res
	}
	res.Error = ""
	c := ChooseBy(good, s.Lib.shelfHave(f.Title), rules.Official != "any")
	res.Queued, res.Have, res.Total, res.BySite = len(c.IDs), c.Have, c.Total, c.BySite
	for _, o := range good {
		_ = e.Follow(ctx, o.MangaID)
	}
	if len(c.IDs) > 0 {
		if err := e.Download(ctx, c.IDs); err != nil {
			res.Error, res.Queued = err.Error(), 0
		}
	}
	return res
}

// Get starts following a title and queues its chapters.
func (s *Service) Get(ctx context.Context, title string, on []Found) GetResult {
	title = strings.TrimSpace(title)
	f := Followed{Title: title, On: on, Since: time.Now().UTC().Format(time.RFC3339)}
	res := s.get(ctx, f)
	if res.Error != "" && res.Total == 0 {
		return res
	}
	f.Checked, f.Total = f.Since, res.Total
	s.fmu.Lock()
	defer s.fmu.Unlock()
	list := s.Lib.loadFollowed()
	found := false
	for i := range list {
		if TitleKey(list[i].Title) == TitleKey(title) {
			f.Title, f.Since = list[i].Title, list[i].Since
			f.Dressed, f.Covered, f.Info = list[i].Dressed, list[i].Covered, list[i].Info
			list[i], found = f, true
		}
	}
	if !found {
		list = append(list, f)
	}
	sort.Slice(list, func(i, j int) bool { return strings.ToLower(list[i].Title) < strings.ToLower(list[j].Title) })
	if err := s.Lib.saveFollowed(list); err != nil {
		res.Error = "Harbor queued the chapters but could not save its list: " + err.Error()
	}
	return res
}

// CheckFollowed looks for new chapters of every followed title. A site that
// stops answering is simply skipped, so the other sites fill in.
func (s *Service) CheckFollowed(ctx context.Context) {
	if s.Engine == "" {
		return
	}
	s.fmu.Lock()
	list := s.Lib.loadFollowed()
	s.fmu.Unlock()
	for i := range list {
		if ctx.Err() != nil {
			return
		}
		res := s.get(ctx, list[i])
		list[i].Checked = time.Now().UTC().Format(time.RFC3339)
		list[i].Note = ""
		if res.Total > 0 {
			list[i].Total = res.Total
		}
		if len(res.Failed) > 0 {
			list[i].Note = "Did not answer last time: " + strings.Join(res.Failed, ", ")
		}
	}
	s.fmu.Lock()
	defer s.fmu.Unlock()
	// Keep anything added while the check ran.
	now := s.Lib.loadFollowed()
	for i := range now {
		for _, old := range list {
			if TitleKey(old.Title) == TitleKey(now[i].Title) {
				now[i].Checked, now[i].Total, now[i].Note = old.Checked, old.Total, old.Note
			}
		}
	}
	if len(now) > 0 {
		_ = s.Lib.saveFollowed(now)
	}
}
