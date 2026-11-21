package manga

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func ch(id int, n float64, name string) Chapter { return Chapter{ID: id, Number: n, Name: name} }

func TestChooseOfficialFirstThenFillGaps(t *testing.T) {
	fan := Option{MangaID: 1, Site: "MangaFire", Chapters: []Chapter{
		ch(10, 0, "Ch. 0 - please delete"), ch(11, 1, "Ch. 1"), ch(12, 2, "Ch. 2"), ch(13, 3, "Ch. 3"),
		ch(14, 3.1, "Ch. 3.1"), ch(15, 3.2, "Ch. 3.2"), ch(16, 4.5, "Ch. 4.5"), ch(17, 4, "Ch. 4"),
	}}
	off := Option{MangaID: 2, Site: "MANGA Plus", Chapters: []Chapter{ch(21, 1, "#001"), ch(22, 4, "#004")}}
	c := Choose([]Option{fan, off}, map[string]bool{"2": true})
	if c.Total != 5 || c.Have != 1 {
		t.Fatalf("total %d have %d", c.Total, c.Have)
	}
	want := []int{21, 13, 22, 16} // 1 official, 3 fan, 4 official, 4.5 fan; 2 is on the shelf
	if len(c.IDs) != len(want) {
		t.Fatalf("ids %v", c.IDs)
	}
	for i := range want {
		if c.IDs[i] != want[i] {
			t.Fatalf("ids %v, want %v", c.IDs, want)
		}
	}
	if c.BySite["MANGA Plus"] != 2 || c.BySite["MangaFire"] != 2 {
		t.Fatalf("by site %v", c.BySite)
	}
}

// fakeEngine answers the few requests Harbor makes.
func fakeEngine(t *testing.T, queued *[]int) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Query string         `json:"query"`
			Vars  map[string]any `json:"variables"`
		}
		_ = json.NewDecoder(r.Body).Decode(&in)
		reply := func(s string) { _, _ = w.Write([]byte(`{"data":` + s + `}`)) }
		switch {
		case strings.Contains(in.Query, "sources{"):
			reply(`{"sources":{"nodes":[{"id":"0","name":"Local source","lang":"localsourcelang"},{"id":"111","name":"MangaFire","lang":"en"},{"id":"222","name":"MANGA Plus","lang":"en"},{"id":"333","name":"Broken","lang":"en"}]}}`)
		case strings.Contains(in.Query, "fetchSourceManga"):
			i := in.Vars["i"].(map[string]any)
			switch i["source"] {
			case "111":
				reply(`{"fetchSourceManga":{"mangas":[{"id":1,"title":"The Eminence in Shadow","thumbnailUrl":"/api/v1/manga/1/thumbnail"},{"id":3,"title":"Shadow House","thumbnailUrl":""}]}}`)
			case "222":
				reply(`{"fetchSourceManga":{"mangas":[{"id":2,"title":"The Eminence in Shadow!","thumbnailUrl":""}]}}`)
			default:
				_, _ = w.Write([]byte(`{"errors":[{"message":"site is down"}]}`))
			}
		case strings.Contains(in.Query, "fetchMangaAndChapters(input:{mangaId"):
			_, _ = w.Write([]byte(`{"errors":[{"message":"unknown field mangaId"}]}`))
		case strings.Contains(in.Query, "fetchMangaAndChapters"):
			reply(`{"fetchMangaAndChapters":{"clientMutationId":null}}`)
		case strings.Contains(in.Query, "chapters(condition"):
			if in.Vars["id"].(float64) == 1 {
				reply(`{"chapters":{"nodes":[{"id":11,"name":"Ch. 1","chapterNumber":1,"scanlator":"unofficial","isDownloaded":false},{"id":12,"name":"Ch. 2","chapterNumber":2,"scanlator":"unofficial","isDownloaded":false}]}}`)
			} else {
				reply(`{"chapters":{"nodes":[{"id":21,"name":"#001","chapterNumber":1,"scanlator":"","isDownloaded":false}]}}`)
			}
		case strings.Contains(in.Query, "enqueueChapterDownloads"):
			for _, v := range in.Vars["ids"].([]any) {
				*queued = append(*queued, int(v.(float64)))
			}
			reply(`{"enqueueChapterDownloads":{"clientMutationId":null}}`)
		case strings.Contains(in.Query, "downloadStatus"):
			reply(`{"downloadStatus":{"state":"STARTED","queue":[{"state":"DOWNLOADING","progress":0.5,"chapter":{"name":"Ch. 2"},"manga":{"title":"The Eminence in Shadow"}},{"state":"ERROR","progress":0,"chapter":{"name":"Ch. 3"},"manga":{"title":"X"}}]}}`)
		default:
			reply(`{}`)
		}
	}))
}

func TestSearchGetAndQueue(t *testing.T) {
	var queued []int
	srv := fakeEngine(t, &queued)
	defer srv.Close()
	e := Engine{URL: srv.URL}
	res, err := e.Search(context.Background(), "eminence in shadow")
	if err != nil {
		t.Fatal(err)
	}
	if res.Sites != 3 || len(res.Failed) != 1 || res.Failed[0] != "Broken" {
		t.Fatalf("sites %d failed %v", res.Sites, res.Failed)
	}
	if len(res.Hits) != 2 || len(res.Hits[0].On) != 2 || !res.Hits[0].Official {
		t.Fatalf("hits %+v", res.Hits)
	}
	if res.Hits[0].Cover != "/api/v1/harbor/manga/cover?id=1" {
		t.Fatalf("cover %q", res.Hits[0].Cover)
	}

	dir := t.TempDir()
	s := &Service{Lib: Librarian{Library: dir, RawRoot: filepath.Join(dir, "engine-trial"), Rules: DefaultRules()}, Engine: srv.URL}
	got := s.Get(context.Background(), res.Hits[0].Title, res.Hits[0].On)
	if got.Error != "" || got.Queued != 2 || got.Total != 2 {
		t.Fatalf("get %+v", got)
	}
	if len(queued) != 2 || queued[0] != 21 || queued[1] != 12 {
		t.Fatalf("queued %v", queued)
	}
	if _, err := os.Stat(filepath.Join(dir, ".harbor", "following.json")); err != nil {
		t.Fatal(err)
	}
	al := aliases(s.Lib.loadFollowed())
	if al[TitleKey("The Eminence in Shadow!")] != "The Eminence in Shadow" && len(al) != 0 {
		t.Fatalf("aliases %v", al)
	}

	q, err := e.Queue(context.Background())
	if err != nil || !q.Going || q.Left != 2 || q.Stuck != 1 {
		t.Fatalf("queue %+v %v", q, err)
	}
}
