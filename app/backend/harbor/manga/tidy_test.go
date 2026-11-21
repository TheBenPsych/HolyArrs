package manga

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeCBZ(t *testing.T, path string, pad int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	w, _ := zw.Create("001.jpg")
	_, _ = w.Write(make([]byte, 100+pad))
	_ = zw.Close()
	_ = f.Close()
	old := time.Now().Add(-time.Hour)
	_ = os.Chtimes(path, old, old)
}

func TestTidyTrialSeries(t *testing.T) {
	lib := t.TempDir()
	rawDir := filepath.Join(lib, "engine-trial", "mangas", "MangaFire (EN)", "The Eminence in Shadow")
	names := []string{"unofficial_Ch. 0 - please delete", "unofficial_Ch. 4.5", "unofficial_Ch. 10.1", "unofficial_Ch. 10.2"}
	for i := 1; i <= 12; i++ {
		names = append(names, fmt.Sprintf("unofficial_Ch. %d", i))
	}
	for _, n := range names {
		writeCBZ(t, filepath.Join(rawDir, n+".cbz"), 0)
	}
	l := Librarian{Library: lib, RawRoot: filepath.Join(lib, "engine-trial"), Rules: DefaultRules()}
	reps, err := l.TidyAll()
	if err != nil || len(reps) != 1 {
		t.Fatalf("TidyAll: %v, %d reports", err, len(reps))
	}
	r := reps[0]
	if r.Error != "" || r.Chapters != 13 || r.Added != 13 || len(r.LeftOut) != 3 || len(r.Sources) != 1 || r.Sources[0] != "MangaFire" {
		t.Fatalf("report = %+v", r)
	}
	folder := filepath.Join(lib, "The Eminence in Shadow")
	for _, want := range []string{"The Eminence in Shadow - Chapter 001.cbz", "The Eminence in Shadow - Chapter 004.5.cbz", "The Eminence in Shadow - Chapter 010.cbz", "series.json", "cover.jpg"} {
		if !exists(filepath.Join(folder, want)) {
			t.Errorf("missing %s", want)
		}
	}
	entries, _ := os.ReadDir(folder)
	if len(entries) != 15 { // 13 chapters, series.json, cover.jpg; no .part leftovers
		t.Errorf("folder has %d entries, want 15", len(entries))
	}
	// Raw files are untouched.
	if !exists(filepath.Join(rawDir, "unofficial_Ch. 10.1.cbz")) || !exists(filepath.Join(rawDir, "unofficial_Ch. 0 - please delete.cbz")) {
		t.Errorf("a raw file was removed")
	}
	var sf map[string]any
	b, _ := os.ReadFile(filepath.Join(folder, "series.json"))
	if err := json.Unmarshal(b, &sf); err != nil || sf["title"] != "The Eminence in Shadow" || len(sf["chapters"].([]any)) != 13 {
		t.Fatalf("series.json = %s", b)
	}

	// A second run changes nothing, and keeps keys someone else added.
	sf["anilist"] = 12345
	b, _ = json.Marshal(sf)
	_ = os.WriteFile(filepath.Join(folder, "series.json"), b, 0o664)
	reps, _ = l.TidyAll()
	if reps[0].Added != 0 || reps[0].Removed != 0 {
		t.Errorf("second run added %d removed %d", reps[0].Added, reps[0].Removed)
	}
	b, _ = os.ReadFile(filepath.Join(folder, "series.json"))
	_ = json.Unmarshal(b, &sf)
	if sf["anilist"] != float64(12345) {
		t.Errorf("anilist key was lost: %s", b)
	}

	// The whole chapter 13 turns up after its parts: the parts leave.
	writeCBZ(t, filepath.Join(rawDir, "unofficial_Ch. 13.1.cbz"), 0)
	writeCBZ(t, filepath.Join(rawDir, "unofficial_Ch. 13.2.cbz"), 0)
	reps, _ = l.TidyAll()
	if !exists(filepath.Join(folder, "The Eminence in Shadow - Chapter 013.1.cbz")) || reps[0].Chapters != 15 {
		t.Fatalf("parts of 13 should be kept while there is no whole chapter: %+v", reps[0])
	}
	writeCBZ(t, filepath.Join(rawDir, "unofficial_Ch. 13.cbz"), 0)
	reps, _ = l.TidyAll()
	if exists(filepath.Join(folder, "The Eminence in Shadow - Chapter 013.1.cbz")) || !exists(filepath.Join(folder, "The Eminence in Shadow - Chapter 013.cbz")) || reps[0].Removed != 2 || reps[0].Chapters != 14 {
		t.Errorf("after whole chapter 13: %+v", reps[0])
	}

	// A file someone placed by hand is never removed or overwritten.
	own := filepath.Join(folder, "The Eminence in Shadow - Chapter 014.cbz")
	_ = os.WriteFile(own, []byte("mine"), 0o664)
	writeCBZ(t, filepath.Join(rawDir, "unofficial_Ch. 14.cbz"), 0)
	_, _ = l.TidyAll()
	if got, _ := os.ReadFile(own); string(got) != "mine" {
		t.Errorf("a hand-placed file was overwritten")
	}
}

func TestTwoSitesOneSeries(t *testing.T) {
	lib := t.TempDir()
	rawRoot := filepath.Join(lib, "engine-trial")
	writeCBZ(t, filepath.Join(rawRoot, "mangas", "MangaDex (EN)", "Nine Bells", "Good Group_Ch. 1.cbz"), 5000)
	writeCBZ(t, filepath.Join(rawRoot, "mangas", "Other Site (EN)", "Nine Bells", "Ch. 1.cbz"), 9000)
	writeCBZ(t, filepath.Join(rawRoot, "mangas", "Other Site (EN)", "Nine Bells", "Ch. 2.cbz"), 9000)
	rules := DefaultRules()
	rules.Favourites = []string{"Good Group"}
	reps, _ := Librarian{Library: lib, RawRoot: rawRoot, Rules: rules}.TidyAll()
	if len(reps) != 1 || reps[0].Chapters != 2 || len(reps[0].Sources) != 2 || len(reps[0].LeftOut) != 1 {
		t.Fatalf("report = %+v", reps)
	}
}
