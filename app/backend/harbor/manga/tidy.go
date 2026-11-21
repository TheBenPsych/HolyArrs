package manga

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Librarian tidies the engine's raw folder into the library folder.
type Librarian struct {
	// Library is the tidy folder, for example /manga.
	Library string
	// RawRoot is where the engine saves, for example /manga/engine-trial.
	// The engine keeps series under "mangas/<site>/<series>/" inside it.
	RawRoot string
	Rules   Rules
	// Aliases maps another spelling of a title (as a TitleKey) to its
	// shelf name. See follow.go.
	Aliases map[string]string
}

// SeriesFile is the series.json Harbor writes beside the chapters. Readers
// (Glowfin) use the plain keys; the "harbor_" keys are Harbor's own notes.
type SeriesFile struct {
	Title    string         `json:"title"`
	Chapters []SeriesEntry  `json:"chapters"`
	Total    int            `json:"total_chapters,omitempty"`
	Left     []SeriesLeft   `json:"harbor_left_out,omitempty"`
	Tidied   string         `json:"harbor_tidied,omitempty"`
	Extra    map[string]any `json:"-"`
}

// SeriesEntry is one chapter in series.json.
type SeriesEntry struct {
	Number   float64 `json:"number"`
	File     string  `json:"file"`
	Title    string  `json:"title,omitempty"`
	Source   string  `json:"source"`
	Official bool    `json:"official"`
	Uploader string  `json:"harbor_uploader,omitempty"`
	Raw      string  `json:"harbor_raw,omitempty"`
	Size     int64   `json:"harbor_size,omitempty"`
}

// SeriesLeft is one raw file Harbor left out, and why.
type SeriesLeft struct {
	Name   string `json:"name"`
	Source string `json:"source"`
	Why    string `json:"why"`
}

// Report says what one tidy run did to one series.
type Report struct {
	Series   string       `json:"series"`
	Folder   string       `json:"folder"`
	Chapters int          `json:"chapters"`
	Added    int          `json:"added"`
	Removed  int          `json:"removed"`
	Sources  []string     `json:"sources"`
	Official int          `json:"official"`
	LeftOut  []SeriesLeft `json:"left_out"`
	First    string       `json:"first,omitempty"`
	Last     string       `json:"last,omitempty"`
	Error    string       `json:"error,omitempty"`
}

// Scan finds every series the engine has downloaded: series name to its raw
// chapter files, across all sites.
func (l Librarian) Scan() (map[string][]File, error) {
	out := map[string][]File{}
	root := filepath.Join(l.RawRoot, "mangas")
	sites, err := os.ReadDir(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return out, nil
		}
		return nil, err
	}
	for _, site := range sites {
		if !site.IsDir() {
			continue
		}
		seriesDirs, err := os.ReadDir(filepath.Join(root, site.Name()))
		if err != nil {
			continue
		}
		for _, sd := range seriesDirs {
			if !sd.IsDir() {
				continue
			}
			dir := filepath.Join(root, site.Name(), sd.Name())
			entries, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, e := range entries {
				name := e.Name()
				if e.IsDir() || !strings.EqualFold(filepath.Ext(name), ".cbz") || strings.HasPrefix(name, ".") {
					continue
				}
				info, err := e.Info()
				if err != nil || info.Size() == 0 {
					continue
				}
				// A file the engine is still writing changes under us; leave
				// it for the next run.
				if time.Since(info.ModTime()) < 20*time.Second {
					continue
				}
				series := sd.Name()
				if to, ok := l.Aliases[TitleKey(series)]; ok {
					series = to
				}
				out[series] = append(out[series], File{Path: filepath.Join(dir, name), Source: SourceName(site.Name()),
					Size: info.Size(), Raw: ParseRaw(strings.TrimSuffix(name, filepath.Ext(name)))})
			}
		}
	}
	return out, nil
}

// TidyAll tidies every series and reports on each, by name.
func (l Librarian) TidyAll() ([]Report, error) {
	all, err := l.Scan()
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(all))
	for n := range all {
		names = append(names, n)
	}
	sort.Strings(names)
	reports := make([]Report, 0, len(names))
	for _, n := range names {
		reports = append(reports, l.tidy(MakePlan(n, all[n], l.Rules)))
	}
	return reports, nil
}

// tidy makes the library folder match the plan. It only ever removes files
// that an earlier run of Harbor put there (listed in series.json), so a
// file someone placed in the folder by hand is never touched.
func (l Librarian) tidy(p Plan) Report {
	folder := filepath.Join(l.Library, SafeName(p.Series))
	rep := Report{Series: p.Series, Folder: folder, LeftOut: []SeriesLeft{}, Sources: []string{}}
	for _, d := range p.Dropped {
		rep.LeftOut = append(rep.LeftOut, SeriesLeft{Name: filepath.Base(d.File.Path), Source: d.File.Source, Why: d.Why})
	}
	if len(p.Kept) == 0 {
		return rep
	}
	if err := os.MkdirAll(folder, 0o775); err != nil {
		rep.Error = "Could not make the series folder: " + err.Error()
		return rep
	}
	old := readSeries(filepath.Join(folder, "series.json"))
	mine := map[string]SeriesEntry{}
	for _, c := range old.Chapters {
		mine[c.File] = c
	}
	sf := SeriesFile{Title: p.Series, Total: len(p.Kept), Left: rep.LeftOut, Tidied: time.Now().UTC().Format(time.RFC3339)}
	seen := map[string]bool{}
	want := map[string]bool{}
	for _, k := range p.Kept {
		want[k.Name] = true
		dst := filepath.Join(folder, k.Name)
		prev, had := mine[k.Name]
		fresh := !had || prev.Raw != k.File.Path || prev.Size != k.File.Size || !exists(dst)
		if fresh {
			if _, made := mine[k.Name]; !made && exists(dst) {
				// Someone's own file already has this name: it wins.
				sf.Chapters = append(sf.Chapters, SeriesEntry{Number: k.Number.Float(), File: k.Name, Source: "Your own file"})
				continue
			}
			if err := place(k.File.Path, dst); err != nil {
				rep.Error = fmt.Sprintf("Could not place chapter %s: %v", k.Number, err)
				continue
			}
			rep.Added++
		}
		if !seen[k.File.Source] {
			seen[k.File.Source] = true
			rep.Sources = append(rep.Sources, k.File.Source)
		}
		if k.Official {
			rep.Official++
		}
		uploader := k.File.Raw.Group
		sf.Chapters = append(sf.Chapters, SeriesEntry{Number: k.Number.Float(), File: k.Name, Title: k.Title, Source: k.File.Source,
			Official: k.Official, Uploader: uploader, Raw: k.File.Path, Size: k.File.Size})
	}
	for name, c := range mine {
		if !want[name] && c.Raw != "" { // Harbor made it and no longer wants it
			if os.Remove(filepath.Join(folder, name)) == nil {
				rep.Removed++
			}
		}
	}
	rep.Chapters = len(sf.Chapters)
	if len(p.Kept) > 0 {
		rep.First, rep.Last = p.Kept[0].Number.String(), p.Kept[len(p.Kept)-1].Number.String()
	}
	if !exists(filepath.Join(folder, "cover.jpg")) {
		_ = writeCover(p.Kept[0].File.Path, filepath.Join(folder, "cover.jpg"))
	}
	if err := writeJSON(filepath.Join(folder, "series.json"), sf, old.Extra); err != nil && rep.Error == "" {
		rep.Error = "Could not write series.json: " + err.Error()
	}
	return rep
}

func exists(p string) bool { _, err := os.Stat(p); return err == nil }

// place puts src at dst as a hard link (no extra space), or as a copy when
// the two are on different disks. The file appears under its final name
// only when it is whole.
func place(src, dst string) error {
	tmp := filepath.Join(filepath.Dir(dst), "."+filepath.Base(dst)+".part")
	_ = os.Remove(tmp)
	if err := os.Link(src, tmp); err != nil {
		if err := copyFile(src, tmp); err != nil {
			_ = os.Remove(tmp)
			return err
		}
	}
	if err := os.Rename(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o664)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// readSeries reads an earlier series.json, keeping keys Harbor does not
// know (a later step adds the author, story and AniList number) so they
// survive a tidy run.
func readSeries(path string) SeriesFile {
	var sf SeriesFile
	b, err := os.ReadFile(path)
	if err != nil {
		return sf
	}
	_ = json.Unmarshal(b, &sf)
	_ = json.Unmarshal(b, &sf.Extra)
	for _, k := range []string{"title", "chapters", "total_chapters", "harbor_left_out", "harbor_tidied"} {
		delete(sf.Extra, k)
	}
	return sf
}

func writeJSON(path string, sf SeriesFile, extra map[string]any) error {
	b, err := json.Marshal(sf)
	if err != nil {
		return err
	}
	all := map[string]any{}
	for k, v := range extra {
		all[k] = v
	}
	var own map[string]any
	if err := json.Unmarshal(b, &own); err != nil {
		return err
	}
	for k, v := range own {
		all[k] = v
	}
	out, err := json.MarshalIndent(all, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(filepath.Dir(path), ".series.json.part")
	if err := os.WriteFile(tmp, out, 0o664); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// writeCover saves the first picture of a chapter as the series cover,
// until a later step fetches the real cover.
func writeCover(cbz, dst string) error {
	zr, err := zip.OpenReader(cbz)
	if err != nil {
		return err
	}
	defer zr.Close()
	var names []string
	byName := map[string]*zip.File{}
	for _, f := range zr.File {
		ext := strings.ToLower(filepath.Ext(f.Name))
		if ext == ".jpg" || ext == ".jpeg" {
			names = append(names, f.Name)
			byName[f.Name] = f
		}
	}
	if len(names) == 0 {
		return errors.New("no jpg page to use as a cover")
	}
	sort.Strings(names)
	rc, err := byName[names[0]].Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	tmp := filepath.Join(filepath.Dir(dst), ".cover.jpg.part")
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o664)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, io.LimitReader(rc, 20<<20)); err != nil {
		out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, dst)
}
