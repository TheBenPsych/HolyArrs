// Package manga is Harbor's manga librarian. The manga engine (Suwayomi)
// is a good downloader and a poor librarian: it saves every chapter under
// the name the site gave it, keeps junk notices, and keeps the same chapter
// several times. This package reads the engine's raw folder and builds a
// tidy library beside it that a reader can open:
//
//	Manga/<Series>/<Series> - Chapter 010.cbz
//	Manga/<Series>/series.json
//	Manga/<Series>/cover.jpg
//
// The raw files are never changed or removed, so the engine still knows
// what it has. Tidy files are hard links where the disk allows it, so they
// take no extra space.
//
// Harbor only (not part of HolyArrs).
package manga

import (
	"regexp"
	"strconv"
	"strings"
)

// Number is a chapter number such as 10 or 4.5. Frac holds the digits after
// the point exactly as written ("5", "1", "25"), or "" for a whole chapter.
type Number struct {
	Whole int
	Frac  string
}

// String gives "10" or "4.5".
func (n Number) String() string {
	if n.Frac == "" {
		return strconv.Itoa(n.Whole)
	}
	return strconv.Itoa(n.Whole) + "." + n.Frac
}

// Float gives the number for JSON and for sorting.
func (n Number) Float() float64 {
	f, _ := strconv.ParseFloat(n.String(), 64)
	return f
}

// Padded gives "010" or "004.5", with the whole part padded to width.
func (n Number) Padded(width int) string {
	s := strconv.Itoa(n.Whole)
	for len(s) < width {
		s = "0" + s
	}
	if n.Frac != "" {
		s += "." + n.Frac
	}
	return s
}

// Raw is what a raw file name says about the chapter inside it.
type Raw struct {
	Group  string // the uploader label the engine put in front, "" if none
	Number Number
	HasNum bool
	Title  string // the chapter's own name, "" if it has none
}

var (
	chapterRE = regexp.MustCompile(`(?i)(?:^|[\s_\-\[(])(?:ch(?:apter|ap)?|ep(?:isode)?|#)\.?\s*(\d+)(?:\.(\d+))?`)
	volumeRE  = regexp.MustCompile(`(?i)\bvol(?:ume)?\.?\s*\d+(?:\.\d+)?`)
	bareNumRE = regexp.MustCompile(`(?:^|[^\d.])(\d+)(?:\.(\d+))?(?:[^\d]|$)`)
	junkRE    = regexp.MustCompile(`(?i)\b(please delete|delete (this|me)|to be deleted|placeholder|notice|announcement|recruit(ing|ment)?|we are hiring|join (us|our)|hiatus (notice|announcement)|dropped|moved to|read (this|first)|test upload)\b`)
)

// ParseRaw reads a raw file's base name (without ".cbz"). The engine names
// files "<uploader>_<chapter name>" when the site names an uploader, and
// just "<chapter name>" when it does not.
func ParseRaw(base string) Raw {
	var r Raw
	name := base
	if i := strings.Index(base, "_"); i > 0 {
		rest := base[i+1:]
		if chapterRE.MatchString(rest) || !chapterRE.MatchString(base[:i]) {
			r.Group, name = strings.TrimSpace(base[:i]), rest
		}
	}
	name = strings.TrimSpace(name)
	end := -1
	if m := chapterRE.FindStringSubmatchIndex(name); m != nil {
		r.Number, r.HasNum = numberOf(name[m[2]:m[3]], sub(name, m[4], m[5])), true
		end = m[1]
	} else {
		// No "Ch." word: take the first number that is not a volume number.
		plain := volumeRE.ReplaceAllStringFunc(name, func(s string) string { return strings.Repeat(" ", len(s)) })
		if m := bareNumRE.FindStringSubmatchIndex(plain); m != nil {
			r.Number, r.HasNum = numberOf(plain[m[2]:m[3]], sub(plain, m[4], m[5])), true
			end = m[3]
			if m[5] > 0 {
				end = m[5]
			}
		}
	}
	if end >= 0 && end <= len(name) {
		r.Title = strings.Trim(name[end:], " -:–—.")
	} else {
		r.Title = name
	}
	return r
}

func sub(s string, a, b int) string {
	if a < 0 || b < 0 {
		return ""
	}
	return s[a:b]
}

func numberOf(whole, frac string) Number {
	w, _ := strconv.Atoi(whole)
	frac = strings.TrimRight(frac, "0")
	return Number{Whole: w, Frac: frac}
}

// Junk reports whether a raw entry is a site notice and not a chapter, such
// as "Ch. 0 - please delete".
func (r Raw) Junk() bool {
	return junkRE.MatchString(r.Title) || (!r.HasNum && junkRE.MatchString(r.Group))
}

// officialSources are sites run by the publishers themselves.
var officialSources = []string{"manga plus", "mangaplus", "viz", "k manga", "kmanga", "webtoons", "comikey", "tapas", "azuki", "j-novel", "kodansha", "shonen jump", "pocket comics"}

// Official reports whether a chapter is an official release: it came from a
// publisher's own site, or the uploader label says official. A label that
// says "unofficial" is not.
func Official(source, group string) bool {
	s := strings.ToLower(source)
	for _, o := range officialSources {
		if strings.Contains(s, o) {
			return true
		}
	}
	g := strings.ToLower(group)
	return strings.Contains(g, "official") && !strings.Contains(g, "unofficial") && !strings.Contains(g, "non-official") && !strings.Contains(g, "not official")
}

var (
	badFileChars = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)
	spaces       = regexp.MustCompile(`\s+`)
	langTag      = regexp.MustCompile(`\s*\([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?\)\s*$`)
)

// SafeName makes a series title safe to use as a folder and file name.
func SafeName(title string) string {
	s := badFileChars.ReplaceAllString(title, " ")
	s = strings.Trim(spaces.ReplaceAllString(s, " "), " .")
	if s == "" {
		s = "Untitled"
	}
	if len(s) > 120 {
		s = strings.TrimSpace(s[:120])
	}
	return s
}

// SourceName drops the language tag the engine adds: "MangaDex (EN)" gives "MangaDex".
func SourceName(folder string) string { return strings.TrimSpace(langTag.ReplaceAllString(folder, "")) }
