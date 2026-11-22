package manga

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type fakeSearch map[string][]Hit

func (f fakeSearch) Search(_ context.Context, q string, _ SiteRules) (SearchResult, error) {
	return SearchResult{Hits: f[q]}, nil
}

func TestHandleAsks(t *testing.T) {
	dir := t.TempDir()
	s := &Service{Lib: Librarian{Library: dir}, Engine: "http://engine"}
	asks := []Ask{
		{ID: "a1", AniList: 1, Title: "Frieren: Beyond Journey's End", Titles: []string{"Sousou no Frieren"}},
		{ID: "a2", AniList: 2, Title: "Nowhere Manga"},
	}
	b, _ := json.Marshal(asks)
	_ = os.MkdirAll(filepath.Join(dir, ".harbor"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, ".harbor", "asks.json"), b, 0o644)
	eng := fakeSearch{
		"Frieren: Beyond Journey's End": {{Title: "Frieren", On: []Found{{ID: 9, Title: "Frieren", Site: "X"}}}},
		"Sousou no Frieren": {
			{Title: "Sousou no Frieren", On: []Found{{ID: 1, Title: "Sousou no Frieren", Site: "Fan"}}},
			{Title: "Sousou no Frieren", Official: true, On: []Found{{ID: 2, Title: "Sousou no Frieren", Site: "Official"}}},
		},
	}
	var gotTitle string
	var gotOn []Found
	get := func(_ context.Context, title string, on []Found) GetResult {
		gotTitle, gotOn = title, on
		return GetResult{Title: title, Queued: 5, Total: 5}
	}
	s.handleAsks(context.Background(), eng, get)
	done := s.Lib.loadAsksDone()
	if d := done["a1"]; d.State != "got" || d.Site != "Official" || d.Queued != 5 {
		t.Fatalf("a1 = %+v", d)
	}
	if gotTitle != "Frieren: Beyond Journey's End" || len(gotOn) != 1 || gotOn[0].ID != 2 {
		t.Fatalf("get(%q, %+v)", gotTitle, gotOn)
	}
	if d := done["a2"]; d.State != "notfound" {
		t.Fatalf("a2 = %+v", d)
	}
	// A second round does nothing new
	gotTitle = ""
	s.handleAsks(context.Background(), eng, get)
	if gotTitle != "" {
		t.Fatal("asked twice")
	}
}
