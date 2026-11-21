package manga

import (
	"bytes"
	"context"
	"errors"
	"image"
	_ "image/gif" // covers come in whatever format the site uses
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
)

// Info is what the engine knows about a title, for series.json.
type Info struct {
	Author string   `json:"author,omitempty"`
	Story  string   `json:"story,omitempty"`
	Status string   `json:"status,omitempty"`
	Genres []string `json:"genres,omitempty"`
}

// extras turns Info into series.json keys.
func (i Info) extras() map[string]any {
	m := map[string]any{}
	if i.Author != "" {
		m["author"] = i.Author
	}
	if i.Story != "" {
		m["story"] = i.Story
	}
	if i.Status != "" {
		m["status"] = i.Status
	}
	if len(i.Genres) > 0 {
		m["genres"] = i.Genres
	}
	return m
}

// Info asks the engine what it knows about one title.
func (e Engine) Info(ctx context.Context, mangaID int) (Info, error) {
	var d struct {
		M struct {
			Author string   `json:"author"`
			Desc   string   `json:"description"`
			Genre  []string `json:"genre"`
			Status string   `json:"status"`
		} `json:"manga"`
	}
	if err := e.do(ctx, `query($id:Int!){manga(id:$id){author description genre status}}`, map[string]any{"id": mangaID}, &d); err != nil {
		return Info{}, err
	}
	status := map[string]string{"ONGOING": "ongoing", "COMPLETED": "finished", "PUBLISHING_FINISHED": "finished", "CANCELLED": "cancelled", "ON_HIATUS": "on a break", "LICENSED": "licensed"}[d.M.Status]
	return Info{Author: strings.TrimSpace(d.M.Author), Story: strings.TrimSpace(d.M.Desc), Status: status, Genres: d.M.Genre}, nil
}

// Cover fetches a title's cover from the engine and saves it as a JPEG.
func (e Engine) Cover(ctx context.Context, mangaID int, dst string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, e.URL+"/api/v1/manga/"+strconv.Itoa(mangaID)+"/thumbnail", nil)
	if err != nil {
		return err
	}
	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return errors.New("the engine has no cover for this title")
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 12<<20))
	if err != nil {
		return err
	}
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return err
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: 90}); err != nil {
		return err
	}
	tmp := filepath.Join(filepath.Dir(dst), ".cover.jpg.part")
	if err := os.WriteFile(tmp, out.Bytes(), 0o664); err != nil {
		return err
	}
	return os.Rename(tmp, dst)
}

// dressFollowed gives followed titles their real cover and story text. It
// runs after a tidy, once per title, when the title's folder exists.
func (s *Service) dressFollowed(ctx context.Context) {
	if s.Engine == "" {
		return
	}
	e := Engine{URL: s.Engine}
	s.fmu.Lock()
	list := s.Lib.loadFollowed()
	s.fmu.Unlock()
	done := map[string]Followed{}
	for _, f := range list {
		folder := filepath.Join(s.Lib.Library, SafeName(f.Title))
		if f.Dressed || len(f.On) == 0 || !exists(filepath.Join(folder, "series.json")) {
			continue
		}
		c, cancel := context.WithTimeout(ctx, 40*time.Second)
		for _, o := range f.On {
			if f.Info == nil {
				if in, err := e.Info(c, o.ID); err == nil && (in.Story != "" || in.Author != "") {
					f.Info = &in
				}
			}
			if !f.Covered && e.Cover(c, o.ID, filepath.Join(folder, "cover.jpg")) == nil {
				f.Covered = true
			}
		}
		cancel()
		// One try is enough: a title with no cover on any site keeps the
		// first page as its cover.
		f.Dressed = true
		done[TitleKey(f.Title)] = f
	}
	if len(done) == 0 {
		return
	}
	s.fmu.Lock()
	now := s.Lib.loadFollowed()
	for i := range now {
		if d, ok := done[TitleKey(now[i].Title)]; ok {
			now[i].Dressed, now[i].Covered, now[i].Info = d.Dressed, d.Covered, d.Info
		}
	}
	_ = s.Lib.saveFollowed(now)
	s.fmu.Unlock()
}

// infoFor maps each followed title to its series.json extras.
func infoFor(list []Followed) map[string]map[string]any {
	m := map[string]map[string]any{}
	for _, f := range list {
		if f.Info != nil {
			m[TitleKey(f.Title)] = f.Info.extras()
		}
	}
	return m
}
