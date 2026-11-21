package manga

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// SiteRules is the owner's say over which switched-on sites Harbor asks and
// in what order. It lives beside the followed list.
type SiteRules struct {
	// EnglishOnly skips every site whose language is not English.
	EnglishOnly bool `json:"english_only"`
	// Official is "first" (official sites first, others fill gaps), "only"
	// (nothing but official sites) or "any" (the owner's order alone).
	Official string `json:"official"`
	// Off holds the ids of sites Harbor must not ask.
	Off []string `json:"off"`
	// Order holds site ids, most liked first.
	Order []string `json:"order"`
}

// DefaultSiteRules is English only, official first.
func DefaultSiteRules() SiteRules {
	return SiteRules{EnglishOnly: true, Official: "first", Off: []string{}, Order: []string{}}
}

func (l Librarian) rulesFile() string { return filepath.Join(l.Library, ".harbor", "sites.json") }

func (l Librarian) loadSiteRules() SiteRules {
	r := DefaultSiteRules()
	if b, err := os.ReadFile(l.rulesFile()); err == nil {
		_ = json.Unmarshal(b, &r)
	}
	return r.clean()
}

func (r SiteRules) clean() SiteRules {
	if r.Official != "only" && r.Official != "any" {
		r.Official = "first"
	}
	if r.Off == nil {
		r.Off = []string{}
	}
	if r.Order == nil {
		r.Order = []string{}
	}
	return r
}

func (l Librarian) saveSiteRules(r SiteRules) error {
	p := l.rulesFile()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(r.clean(), "", "  ")
	tmp := p + ".part"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// English reports whether a site's language is English.
func English(lang string) bool {
	l := strings.ToLower(lang)
	return l == "en" || strings.HasPrefix(l, "en-")
}

// Allows reports whether the rules let Harbor ask this site, and if not, why.
func (r SiteRules) Allows(s Site) (bool, string) {
	for _, id := range r.Off {
		if id == s.ID {
			return false, "Switched off here"
		}
	}
	if r.EnglishOnly && !English(s.Lang) {
		return false, "Not English"
	}
	if r.Official == "only" && !Official(s.Name, "") {
		return false, "Not an official site"
	}
	return true, ""
}

// Rank gives a site's place in the owner's order; unlisted sites come after.
func (r SiteRules) Rank(id string) int {
	for i, o := range r.Order {
		if o == id {
			return i
		}
	}
	return len(r.Order) + 1
}

// SiteRow is one site as the Sites panel shows it.
type SiteRow struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Lang     string `json:"lang"`
	Official bool   `json:"official"`
	Off      bool   `json:"off"`
	Asked    bool   `json:"asked"`
	Why      string `json:"why,omitempty"`
}

// SitesView is the Sites panel: the rules and every switched-on site, in
// the owner's order.
type SitesView struct {
	Rules SiteRules `json:"rules"`
	Sites []SiteRow `json:"sites"`
}

func sitesView(sites []Site, r SiteRules) SitesView {
	v := SitesView{Rules: r, Sites: make([]SiteRow, 0, len(sites))}
	for _, s := range sites {
		ok, why := r.Allows(s)
		off := false
		for _, id := range r.Off {
			off = off || id == s.ID
		}
		v.Sites = append(v.Sites, SiteRow{ID: s.ID, Name: s.Name, Lang: s.Lang, Official: Official(s.Name, ""), Off: off, Asked: ok, Why: why})
	}
	sort.SliceStable(v.Sites, func(i, j int) bool {
		a, b := v.Sites[i], v.Sites[j]
		if ra, rb := r.Rank(a.ID), r.Rank(b.ID); ra != rb {
			return ra < rb
		}
		if English(a.Lang) != English(b.Lang) {
			return English(a.Lang)
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})
	return v
}

// allowed keeps the sites the rules let Harbor ask.
func (r SiteRules) allowed(sites []Site) []Site {
	out := make([]Site, 0, len(sites))
	for _, s := range sites {
		if ok, _ := r.Allows(s); ok {
			out = append(out, s)
		}
	}
	return out
}

// Sites reads the panel.
func (s *Service) Sites(ctx context.Context) (SitesView, error) {
	sites, err := Engine{URL: s.Engine}.Sites(ctx)
	if err != nil {
		return SitesView{}, err
	}
	s.fmu.Lock()
	r := s.Lib.loadSiteRules()
	s.fmu.Unlock()
	return sitesView(sites, r), nil
}
