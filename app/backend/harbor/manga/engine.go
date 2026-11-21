package manga

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Engine talks to the manga engine (Suwayomi) over its GraphQL address.
// Harbor never talks to a manga site itself: it asks the engine, which only
// knows the sites its owner switched on.
type Engine struct {
	URL string
	HC  *http.Client
}

func (e Engine) client() *http.Client {
	if e.HC != nil {
		return e.HC
	}
	return &http.Client{Timeout: 90 * time.Second}
}

// do runs one GraphQL request and decodes "data" into out.
func (e Engine) do(ctx context.Context, query string, vars map[string]any, out any) error {
	if e.URL == "" {
		return errors.New("the manga engine's address is not set")
	}
	body, _ := json.Marshal(map[string]any{"query": query, "variables": vars})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.URL+"/api/graphql", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := e.client().Do(req)
	if err != nil {
		return fmt.Errorf("the manga engine did not answer: %w", err)
	}
	defer res.Body.Close()
	var reply struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(res.Body).Decode(&reply); err != nil {
		return fmt.Errorf("the manga engine gave an answer Harbor could not read (status %d)", res.StatusCode)
	}
	if len(reply.Errors) > 0 {
		return errors.New(reply.Errors[0].Message)
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(reply.Data, out)
}

// Site is one manga site the owner switched on in the engine.
type Site struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Lang string `json:"lang"`
}

// Sites lists the switched-on sites. The engine's own "Local source" (files
// already on disk) is left out.
func (e Engine) Sites(ctx context.Context) ([]Site, error) {
	var d struct {
		Sources struct {
			Nodes []Site `json:"nodes"`
		} `json:"sources"`
	}
	if err := e.do(ctx, `query{sources{nodes{id name lang}}}`, nil, &d); err != nil {
		return nil, err
	}
	out := d.Sources.Nodes[:0]
	for _, s := range d.Sources.Nodes {
		if s.ID == "0" || strings.EqualFold(s.Lang, "localsourcelang") {
			continue
		}
		out = append(out, s)
	}
	return out, nil
}

// Found is one title on one site.
type Found struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	Cover string `json:"cover,omitempty"`
	Site  string `json:"site"`
}

// SearchSite asks one site for a title.
func (e Engine) SearchSite(ctx context.Context, s Site, q string) ([]Found, error) {
	var d struct {
		F struct {
			Mangas []struct {
				ID    int    `json:"id"`
				Title string `json:"title"`
				Thumb string `json:"thumbnailUrl"`
			} `json:"mangas"`
		} `json:"fetchSourceManga"`
	}
	err := e.do(ctx, `mutation($i:FetchSourceMangaInput!){fetchSourceManga(input:$i){mangas{id title thumbnailUrl}}}`,
		map[string]any{"i": map[string]any{"source": s.ID, "type": "SEARCH", "query": q, "page": 1}}, &d)
	if err != nil {
		return nil, err
	}
	out := make([]Found, 0, len(d.F.Mangas))
	for _, m := range d.F.Mangas {
		// Covers come through Harbor (see the cover route), because the
		// browser is only allowed to load pictures from Harbor itself.
		cover := ""
		if m.Thumb != "" {
			cover = "/api/v1/harbor/manga/cover?id=" + strconv.Itoa(m.ID)
		}
		out = append(out, Found{ID: m.ID, Title: m.Title, Cover: cover, Site: s.Name})
	}
	return out, nil
}

// Hit is one title, with every site that has it.
type Hit struct {
	Key      string  `json:"key"`
	Title    string  `json:"title"`
	Cover    string  `json:"cover,omitempty"`
	Official bool    `json:"official"`
	On       []Found `json:"on"`
}

// SearchResult is what a search across every site found.
type SearchResult struct {
	Hits   []Hit    `json:"hits"`
	Sites  int      `json:"sites"`
	Failed []string `json:"failed"`
}

// TitleKey makes two spellings of one title match: letters and digits only.
func TitleKey(t string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(t) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r > 127 {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Search asks every switched-on site at once (six at a time, like the
// engine itself) and puts the same title from different sites together.
func (e Engine) Search(ctx context.Context, q string) (SearchResult, error) {
	res := SearchResult{Hits: []Hit{}, Failed: []string{}}
	sites, err := e.Sites(ctx)
	if err != nil {
		return res, err
	}
	res.Sites = len(sites)
	type got struct {
		site  Site
		found []Found
		err   error
	}
	all := make([]got, len(sites))
	sem := make(chan struct{}, 6)
	var wg sync.WaitGroup
	for i, s := range sites {
		wg.Add(1)
		go func(i int, s Site) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			c, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			f, err := e.SearchSite(c, s, q)
			all[i] = got{s, f, err}
		}(i, s)
	}
	wg.Wait()
	byKey := map[string]int{}
	qk := TitleKey(q)
	for _, g := range all {
		if g.err != nil {
			res.Failed = append(res.Failed, g.site.Name)
			continue
		}
		seen := map[string]bool{}
		for n, f := range g.found {
			k := TitleKey(f.Title)
			if k == "" || seen[k] || n >= 12 {
				continue
			}
			seen[k] = true
			i, ok := byKey[k]
			if !ok {
				i = len(res.Hits)
				byKey[k] = i
				res.Hits = append(res.Hits, Hit{Key: k, Title: f.Title, Cover: f.Cover})
			}
			h := &res.Hits[i]
			h.On = append(h.On, f)
			if Official(f.Site, "") {
				h.Official = true
			}
		}
	}
	// Best first: the exact title, then titles on the most sites.
	rank := func(h Hit) int {
		switch {
		case h.Key == qk:
			return 0
		case strings.HasPrefix(h.Key, qk):
			return 1
		case strings.Contains(h.Key, qk):
			return 2
		}
		return 3
	}
	sort.SliceStable(res.Hits, func(i, j int) bool {
		a, b := res.Hits[i], res.Hits[j]
		if rank(a) != rank(b) {
			return rank(a) < rank(b)
		}
		return len(a.On) > len(b.On)
	})
	if len(res.Hits) > 30 {
		res.Hits = res.Hits[:30]
	}
	return res, nil
}

// Chapter is one chapter of a title on one site.
type Chapter struct {
	ID         int     `json:"id"`
	Name       string  `json:"name"`
	Number     float64 `json:"chapterNumber"`
	Scanlator  string  `json:"scanlator"`
	Downloaded bool    `json:"isDownloaded"`
}

// Chapters has the engine read a title's chapter list from its site, then
// returns it.
func (e Engine) Chapters(ctx context.Context, mangaID int) ([]Chapter, error) {
	// The engine's name for "go and read the list" differs between
	// versions, so try the ones it has had.
	tries := []string{
		`mutation($id:Int!){fetchMangaAndChapters(input:{mangaId:$id}){clientMutationId}}`,
		`mutation($id:Int!){fetchMangaAndChapters(input:{id:$id}){clientMutationId}}`,
		`mutation($id:Int!){fetchChapters(input:{mangaId:$id}){clientMutationId}}`,
	}
	var ferr error
	for _, q := range tries {
		if ferr = e.do(ctx, q, map[string]any{"id": mangaID}, nil); ferr == nil {
			break
		}
	}
	var d struct {
		Chapters struct {
			Nodes []Chapter `json:"nodes"`
		} `json:"chapters"`
	}
	if err := e.do(ctx, `query($id:Int!){chapters(condition:{mangaId:$id},first:20000){nodes{id name chapterNumber scanlator isDownloaded}}}`,
		map[string]any{"id": mangaID}, &d); err != nil {
		return nil, err
	}
	if len(d.Chapters.Nodes) == 0 && ferr != nil {
		return nil, ferr
	}
	return d.Chapters.Nodes, nil
}

// Follow puts a title in the engine's own library.
func (e Engine) Follow(ctx context.Context, mangaID int) error {
	return e.do(ctx, `mutation($id:Int!){updateManga(input:{id:$id,patch:{inLibrary:true}}){clientMutationId}}`, map[string]any{"id": mangaID}, nil)
}

// Download queues chapters and makes sure the engine's downloader is going.
func (e Engine) Download(ctx context.Context, ids []int) error {
	for len(ids) > 0 {
		n := min(len(ids), 200)
		if err := e.do(ctx, `mutation($ids:[Int!]!){enqueueChapterDownloads(input:{ids:$ids}){clientMutationId}}`, map[string]any{"ids": ids[:n]}, nil); err != nil {
			return err
		}
		ids = ids[n:]
	}
	_ = e.do(ctx, `mutation{startDownloader(input:{}){clientMutationId}}`, nil, nil)
	return nil
}

// QueueItem is one chapter the engine is getting or waiting to get.
type QueueItem struct {
	Title    string  `json:"title"`
	Chapter  string  `json:"chapter"`
	State    string  `json:"state"`
	Progress float64 `json:"progress"`
}

// Queue is the engine's download line.
type Queue struct {
	Going bool        `json:"going"`
	Left  int         `json:"left"`
	Now   []QueueItem `json:"now"`
	Stuck int         `json:"stuck"`
}

// Queue reads the engine's download line.
func (e Engine) Queue(ctx context.Context) (Queue, error) {
	var d struct {
		S struct {
			State string `json:"state"`
			Queue []struct {
				State    string  `json:"state"`
				Progress float64 `json:"progress"`
				Chapter  struct {
					Name string `json:"name"`
				} `json:"chapter"`
				Manga struct {
					Title string `json:"title"`
				} `json:"manga"`
			} `json:"queue"`
		} `json:"downloadStatus"`
	}
	q := Queue{Now: []QueueItem{}}
	if err := e.do(ctx, `query{downloadStatus{state queue{state progress chapter{name} manga{title}}}}`, nil, &d); err != nil {
		return q, err
	}
	q.Going = d.S.State == "STARTED"
	for _, it := range d.S.Queue {
		switch it.State {
		case "FINISHED":
			continue
		case "ERROR":
			q.Stuck++
		}
		q.Left++
		if len(q.Now) < 4 {
			q.Now = append(q.Now, QueueItem{Title: it.Manga.Title, Chapter: it.Chapter.Name, State: it.State, Progress: it.Progress})
		}
	}
	return q, nil
}

// Option is one site's copy of a title, with its chapter list.
type Option struct {
	MangaID  int
	Site     string
	Chapters []Chapter
}

// Choice is what Harbor decided to download for one title.
type Choice struct {
	IDs    []int          // chapter ids to queue, in reading order
	BySite map[string]int // how many of them come from each site
	Have   int            // chapters already on the shelf or downloaded
	Total  int            // different chapters that exist anywhere
}

func numKey(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }

// Choose picks one copy of each chapter across sites: an official site
// first, then the site with the most chapters, and other sites only fill
// the gaps. Chapters already on the shelf (have) or already downloaded are
// skipped, and so are site notices and the parts of a chapter that exists
// whole.
func Choose(opts []Option, have map[string]bool) Choice {
	c := Choice{BySite: map[string]int{}}
	count := func(o Option) int {
		set := map[string]bool{}
		for _, ch := range o.Chapters {
			set[numKey(ch.Number)] = true
		}
		return len(set)
	}
	order := append([]Option(nil), opts...)
	sort.SliceStable(order, func(i, j int) bool {
		oi, oj := Official(order[i].Site, ""), Official(order[j].Site, "")
		if oi != oj {
			return oi
		}
		return count(order[i]) > count(order[j])
	})
	type pickT struct {
		ch   Chapter
		site string
	}
	picks := map[string]pickT{}
	var nums []float64
	for _, o := range order {
		for _, ch := range o.Chapters {
			if ch.Number < 0 || ParseRaw("x_"+ch.Name).Junk() {
				continue
			}
			k := numKey(ch.Number)
			cur, ok := picks[k]
			if !ok {
				nums = append(nums, ch.Number)
				picks[k] = pickT{ch, o.Site}
				continue
			}
			// Inside one site, an official upload or one already
			// downloaded beats the copy seen first.
			if cur.site == o.Site && !cur.ch.Downloaded && (ch.Downloaded || (Official("", ch.Scanlator) && !Official("", cur.ch.Scanlator))) {
				picks[k] = pickT{ch, o.Site}
			}
		}
	}
	sort.Float64s(nums)
	// Parts: 10.1 and 10.2 beside a whole 10 are the same chapter in pieces.
	part := map[string]bool{}
	for _, n := range nums {
		if n != float64(int(n)) {
			continue
		}
		w := int(n)
		_, p1 := picks[fmt.Sprintf("%d.1", w)]
		_, p2 := picks[fmt.Sprintf("%d.2", w)]
		if !p1 || !p2 {
			continue
		}
		for i := 1; ; i++ {
			k := fmt.Sprintf("%d.%d", w, i)
			if _, ok := picks[k]; !ok {
				break
			}
			part[k] = true
		}
	}
	for _, n := range nums {
		k := numKey(n)
		if part[k] {
			continue
		}
		c.Total++
		p := picks[k]
		if have[k] || p.ch.Downloaded {
			c.Have++
			continue
		}
		c.IDs = append(c.IDs, p.ch.ID)
		c.BySite[p.site]++
	}
	return c
}
