package manga

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Glowfin's manga requests (Glowfin Requests > Manga). Glowfin and Harbor
// share the manga folder, so they talk through two small files instead of
// an API key:
//
//   - Manga/.harbor/asks.json is Glowfin's: the manga Ben said yes to, with
//     the names AniList knows them by. Harbor only reads it.
//   - Manga/.harbor/asks-done.json is Harbor's: what happened to each one
//     (got it and following, couldn't find it on any site, or trouble).
//     Glowfin only reads it.
//
// Each ask is handled once. Harbor looks for it on every switched-on site
// under each of its names, takes the copy whose name matches, and gets it
// exactly like pressing Get on the Manga page (official site first, one copy
// of each chapter, new chapters four times a day after that).

// Ask is one manga Glowfin wants.
type Ask struct {
	ID      string   `json:"id"`
	AniList int      `json:"anilist,omitempty"`
	Title   string   `json:"title"`
	Titles  []string `json:"titles,omitempty"`
	Asked   string   `json:"asked,omitempty"`
}

// AskDone is what Harbor did with an ask.
type AskDone struct {
	ID string `json:"id"`
	// State is got, notfound or trouble.
	State  string `json:"state"`
	Shelf  string `json:"shelf,omitempty"`
	Site   string `json:"site,omitempty"`
	Queued int    `json:"queued,omitempty"`
	Total  int    `json:"total,omitempty"`
	Note   string `json:"note,omitempty"`
	Tries  int    `json:"tries,omitempty"`
	At     string `json:"at"`
}

func (l Librarian) asksFile() string { return filepath.Join(l.Library, ".harbor", "asks.json") }
func (l Librarian) asksDoneFile() string {
	return filepath.Join(l.Library, ".harbor", "asks-done.json")
}

func (l Librarian) loadAsks() []Ask {
	var out []Ask
	if b, err := os.ReadFile(l.asksFile()); err == nil {
		_ = json.Unmarshal(b, &out)
	}
	return out
}

func (l Librarian) loadAsksDone() map[string]AskDone {
	var list []AskDone
	if b, err := os.ReadFile(l.asksDoneFile()); err == nil {
		_ = json.Unmarshal(b, &list)
	}
	m := map[string]AskDone{}
	for _, d := range list {
		m[d.ID] = d
	}
	return m
}

func (l Librarian) saveAsksDone(m map[string]AskDone) error {
	list := make([]AskDone, 0, len(m))
	for _, d := range m {
		list = append(list, d)
	}
	p := l.asksDoneFile()
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

// askNames is every name to look under, the main one first, at most four.
func askNames(a Ask) []string {
	seen := map[string]bool{}
	var out []string
	for _, t := range append([]string{a.Title}, a.Titles...) {
		t = strings.TrimSpace(t)
		if k := TitleKey(t); k != "" && !seen[k] {
			seen[k] = true
			out = append(out, t)
		}
		if len(out) == 4 {
			break
		}
	}
	return out
}

// pickHit is the search hit that is really this manga: its name matches one
// of the ask's names. An official copy wins over a fan one.
func pickHit(hits []Hit, names []string) (Hit, bool) {
	keys := map[string]bool{}
	for _, n := range names {
		keys[TitleKey(n)] = true
	}
	var best Hit
	ok := false
	for _, h := range hits {
		if !keys[TitleKey(h.Title)] || len(h.On) == 0 {
			continue
		}
		if !ok || (h.Official && !best.Official) || (h.Official == best.Official && len(h.On) > len(best.On)) {
			best, ok = h, true
		}
	}
	return best, ok
}

// searcher is the part of the engine asks need (a pretend one in tests).
type searcher interface {
	Search(ctx context.Context, q string, rules SiteRules) (SearchResult, error)
}

// HandleAsks works through Glowfin's new asks, a few at a time.
func (s *Service) HandleAsks(ctx context.Context) {
	if s == nil || s.Engine == "" {
		return
	}
	s.handleAsks(ctx, Engine{URL: s.Engine}, func(ctx context.Context, title string, on []Found) GetResult {
		return s.Get(ctx, title, on)
	})
}

const maxAsksPerRound = 3

func (s *Service) handleAsks(ctx context.Context, eng searcher, get func(context.Context, string, []Found) GetResult) {
	s.askMu.Lock()
	defer s.askMu.Unlock()
	asks := s.Lib.loadAsks()
	if len(asks) == 0 {
		return
	}
	done := s.Lib.loadAsksDone()
	s.fmu.Lock()
	rules := s.Lib.loadSiteRules()
	following := s.Lib.loadFollowed()
	s.fmu.Unlock()
	handled := 0
	for _, a := range asks {
		if a.ID == "" || strings.TrimSpace(a.Title) == "" {
			continue
		}
		if d, ok := done[a.ID]; ok && (d.State != "trouble" || d.Tries >= 3) {
			continue
		}
		if handled >= maxAsksPerRound || ctx.Err() != nil {
			break
		}
		handled++
		names := askNames(a)
		d := AskDone{ID: a.ID, Tries: done[a.ID].Tries + 1, At: time.Now().UTC().Format(time.RFC3339)}
		// Already following it (Ben pressed Get in Harbor, or asked twice)
		if f, ok := followedAs(following, names); ok {
			d.State, d.Shelf, d.Note = "got", f, "Harbor was already getting this one"
			done[a.ID] = d
			continue
		}
		failed := 0
		for _, n := range names {
			c, cancel := context.WithTimeout(ctx, 2*time.Minute)
			res, err := eng.Search(c, n, rules)
			cancel()
			if err != nil {
				failed++
				continue
			}
			if h, ok := pickHit(res.Hits, names); ok {
				gc, gcancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Minute)
				r := get(gc, a.Title, h.On)
				gcancel()
				d.Shelf, d.Queued, d.Total = a.Title, r.Queued, r.Total
				if len(h.On) > 0 {
					d.Site = h.On[0].Site
				}
				if r.Error != "" && r.Total == 0 {
					d.State, d.Note = "trouble", r.Error
				} else {
					d.State = "got"
				}
				break
			}
		}
		if d.State == "" {
			if failed == len(names) {
				d.State, d.Note = "trouble", "The manga engine didn't answer"
			} else {
				d.State, d.Note = "notfound", "None of the switched-on sites has it under the names AniList knows"
			}
		}
		done[a.ID] = d
	}
	if handled > 0 {
		_ = s.Lib.saveAsksDone(done)
	}
}

// followedAs is the shelf name of a followed title that matches one of names.
func followedAs(list []Followed, names []string) (string, bool) {
	keys := map[string]bool{}
	for _, n := range names {
		keys[TitleKey(n)] = true
	}
	for _, f := range list {
		if keys[TitleKey(f.Title)] {
			return f.Title, true
		}
		for _, o := range f.On {
			if keys[TitleKey(o.Title)] {
				return f.Title, true
			}
		}
	}
	return "", false
}
