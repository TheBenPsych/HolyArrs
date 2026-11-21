package manga

import (
	"fmt"
	"sort"
	"strings"
)

// File is one raw chapter file the engine downloaded.
type File struct {
	Path   string // full path of the raw .cbz
	Source string // the site it came from, without the language tag
	Size   int64
	Raw    Raw
}

// Kept is one chapter of the tidy library and the raw file chosen for it.
type Kept struct {
	Number   Number
	Title    string
	File     File
	Official bool
	Name     string // the tidy file name
}

// Dropped is a raw file left out of the tidy library, with the reason in
// plain words for Harbor's Tidy report.
type Dropped struct {
	File File
	Why  string
}

// Plan is what tidying one series would do.
type Plan struct {
	Series  string
	Kept    []Kept
	Dropped []Dropped
}

// Rules are the choices the owner can change.
type Rules struct {
	// Favourites are uploader names to prefer among fan translations, best first.
	Favourites []string
	// OfficialFloor is how small an official file may be, as a share of the
	// biggest fan copy of the same chapter, and still win. Official scans
	// are preferred, but not when they are plainly the worse pictures.
	OfficialFloor float64
}

// DefaultRules: official first unless it is under 60% of the size of the
// best fan copy.
func DefaultRules() Rules { return Rules{OfficialFloor: 0.6} }

// MakePlan decides, for one series, which raw file becomes each chapter.
//
//  1. Site notices ("please delete") are left out.
//  2. One copy of each chapter: official first, then favourite uploaders,
//     then the biggest file (the best pictures).
//  3. Split parts (10.1, 10.2 ...) are left out once the whole chapter 10
//     exists. A lone half chapter such as 4.5 is a real extra and is kept.
func MakePlan(series string, files []File, rules Rules) Plan {
	p := Plan{Series: series}
	byNum := map[string][]File{}
	var order []Number
	for _, f := range files {
		switch {
		case f.Raw.Junk():
			p.Dropped = append(p.Dropped, Dropped{f, "A notice from the site, not a chapter"})
		case !f.Raw.HasNum:
			p.Dropped = append(p.Dropped, Dropped{f, "Harbor could not tell which chapter this is"})
		default:
			k := f.Raw.Number.String()
			if _, seen := byNum[k]; !seen {
				order = append(order, f.Raw.Number)
			}
			byNum[k] = append(byNum[k], f)
		}
	}
	sort.Slice(order, func(i, j int) bool { return order[i].Float() < order[j].Float() })

	// Split parts: for a whole chapter N that exists, fractions .1 .2 .3 ...
	// counting up from .1 are the same chapter uploaded in pieces.
	parts := map[string]bool{}
	fracs := map[int]map[string]bool{}
	for _, n := range order {
		if n.Frac != "" {
			if fracs[n.Whole] == nil {
				fracs[n.Whole] = map[string]bool{}
			}
			fracs[n.Whole][n.Frac] = true
		}
	}
	for whole, set := range fracs {
		if _, ok := byNum[Number{Whole: whole}.String()]; !ok || !set["1"] || !set["2"] {
			continue // no whole chapter, or not a run of parts
		}
		for i := 1; set[fmt.Sprint(i)]; i++ {
			parts[Number{Whole: whole, Frac: fmt.Sprint(i)}.String()] = true
		}
	}

	width := 3
	if len(order) > 0 && order[len(order)-1].Whole >= 1000 {
		width = 4
	}
	safe := SafeName(series)
	for _, n := range order {
		group := byNum[n.String()]
		if parts[n.String()] {
			for _, f := range group {
				p.Dropped = append(p.Dropped, Dropped{f, fmt.Sprintf("A part of chapter %d, which is here as one whole chapter", n.Whole)})
			}
			continue
		}
		best := pick(group, rules)
		for _, f := range group {
			if f.Path != best.Path {
				p.Dropped = append(p.Dropped, Dropped{f, fmt.Sprintf("A second copy of chapter %s; kept the one from %s", n, label(best))})
			}
		}
		p.Kept = append(p.Kept, Kept{Number: n, Title: best.Raw.Title, File: best, Official: Official(best.Source, best.Raw.Group),
			Name: fmt.Sprintf("%s - Chapter %s.cbz", safe, n.Padded(width))})
	}
	return p
}

func label(f File) string {
	if f.Raw.Group != "" && !strings.EqualFold(f.Raw.Group, "unofficial") {
		return f.Source + " (" + f.Raw.Group + ")"
	}
	return f.Source
}

// pick chooses the copy to keep among files of the same chapter.
func pick(group []File, rules Rules) File {
	var bestFan int64
	for _, f := range group {
		if !Official(f.Source, f.Raw.Group) && f.Size > bestFan {
			bestFan = f.Size
		}
	}
	score := func(f File) (int, int64) {
		rank := 0
		if Official(f.Source, f.Raw.Group) {
			if bestFan == 0 || float64(f.Size) >= rules.OfficialFloor*float64(bestFan) {
				rank = 1000
			}
		} else {
			for i, fav := range rules.Favourites {
				if strings.EqualFold(strings.TrimSpace(fav), f.Raw.Group) {
					rank = 500 - i
					break
				}
			}
		}
		return rank, f.Size
	}
	best := group[0]
	br, bs := score(best)
	for _, f := range group[1:] {
		r, s := score(f)
		if r > br || (r == br && s > bs) || (r == br && s == bs && f.Path < best.Path) {
			best, br, bs = f, r, s
		}
	}
	return best
}
