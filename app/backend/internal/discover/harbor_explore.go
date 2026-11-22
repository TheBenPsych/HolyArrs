package discover

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/HolyArrs/holyarrs/app/backend/internal/core/webserver"
	"github.com/HolyArrs/holyarrs/app/backend/internal/metadata"
)

// Harbor only (not part of HolyArrs): Explore's "Finish the collection" row,
// the names behind the one search's "Did you mean?",
// and the headings of Harbor's own TMDB rows.

func init() {
	Titles[metadata.HarborStreamingRow] = "New on streaming this week"
	Titles[metadata.HarborAnimeSeasonRow] = "Anime this season"
	TTL[metadata.HarborStreamingRow] = 12 * time.Hour
	TTL[metadata.HarborAnimeSeasonRow] = 12 * time.Hour
}

const (
	// harborFinishMax is how many collections the answer holds.
	harborFinishMax = 30
	// harborFinishLook caps the collections read from TMDB during one
	// visit; the rest are read in the background, so the row grows.
	harborFinishLook = 8
	// harborFinishWarm is how many more are read in the background.
	harborFinishWarm = 60
)

// HarborFinish is one movie collection the household owns part of.
type HarborFinish struct {
	ID      string     `json:"id"`
	Name    string     `json:"name"`
	Owned   int        `json:"owned"`
	Total   int        `json:"total"`
	Missing []ItemView `json:"missing"`
}

type harborOwnedCollection struct {
	name, tmdb string
	owned      int
}

// harborFinish answers GET /api/v1/harbor/finish: collections with at least
// one movie owned and at least one out (released) and not owned, closest
// to finished first. Kids get none.
func (h *Handlers) harborFinish(w http.ResponseWriter, r *http.Request) {
	out := []HarborFinish{}
	d, ok := metadata.DiscovererFor(r.Context(), h.Metadata)
	if !ok || h.KidMax(r) != "" {
		webserver.WriteJSON(w, http.StatusOK, map[string]any{"collections": out})
		return
	}
	rows, err := h.Store.Read().QueryContext(r.Context(), `SELECT c.name, COUNT(t.id), MIN(json_extract(t.source_ids, '$.tmdb'))
		FROM movie_collections c
		JOIN movie_collection_titles ct ON ct.collection_id = c.id
		JOIN titles t ON t.id = ct.title_id AND t.kind = 'movie' AND t.state != 'removed'
		WHERE json_extract(t.source_ids, '$.tmdb') IS NOT NULL
		GROUP BY c.id ORDER BY COUNT(t.id) DESC, MAX(t.id) DESC LIMIT 400`)
	if err != nil {
		webserver.Internal(w, "discover", err)
		return
	}
	var owned []harborOwnedCollection
	for rows.Next() {
		var c harborOwnedCollection
		var tmdb any
		if err := rows.Scan(&c.name, &c.owned, &tmdb); err != nil {
			rows.Close()
			webserver.Internal(w, "discover", err)
			return
		}
		c.tmdb = idText(tmdb)
		if metadata.DigitsOnly(c.tmdb) {
			owned = append(owned, c)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		webserver.Internal(w, "discover", err)
		return
	}
	me := h.UserID(r)
	today := time.Now().UTC().Format("2006-01-02")
	looked := 0
	var later []string
	for _, c := range owned {
		det, ok := h.harborKeptDetails(r.Context(), c.tmdb)
		if !ok {
			if looked >= harborFinishLook {
				later = append(later, c.tmdb)
				continue
			}
			looked++
			if det, ok = h.harborReadDetails(r.Context(), d, c.tmdb); !ok {
				continue
			}
		}
		if det.Collection == nil {
			continue
		}
		var parts []metadata.DiscoverItem
		for _, p := range det.Collection.Parts {
			if p.Released != "" && p.Released <= today {
				parts = append(parts, p)
			}
		}
		if parts, err = h.DropNeverAdd(r.Context(), parts); err != nil {
			webserver.Internal(w, "discover", err)
			return
		}
		views, err := h.JoinItems(r.Context(), parts, me, len(parts))
		if err != nil {
			webserver.Internal(w, "discover", err)
			return
		}
		f := HarborFinish{ID: det.Collection.ID, Name: det.Collection.Name, Total: len(views), Missing: []ItemView{}}
		for _, v := range views {
			if v.InLibrary {
				f.Owned++
			} else {
				f.Missing = append(f.Missing, v)
			}
		}
		if f.Owned > 0 && len(f.Missing) > 0 && f.Total > 1 {
			out = append(out, f)
		}
	}
	if len(later) > 0 {
		later = later[:min(len(later), harborFinishWarm)]
		metadata.RefreshOnce("harbor-finish-warm", func(ctx context.Context) {
			for _, id := range later {
				if ctx.Err() != nil {
					return
				}
				h.harborReadDetails(ctx, d, id)
			}
		})
	}
	sortFinish(out)
	if len(out) > harborFinishMax {
		out = out[:harborFinishMax]
	}
	h.Caching(w, r, "private, max-age=300")
	webserver.WriteJSON(w, http.StatusOK, map[string]any{"collections": out, "reading": len(later)})
}

// sortFinish puts the collections closest to finished first: the larger
// share owned, then the fewer movies missing, then by name.
func sortFinish(out []HarborFinish) {
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		ra, rb := float64(a.Owned)/float64(a.Total), float64(b.Owned)/float64(b.Total)
		if ra != rb {
			return ra > rb
		}
		if len(a.Missing) != len(b.Missing) {
			return len(a.Missing) < len(b.Missing)
		}
		return a.Name < b.Name
	})
}

// harborKeptDetails is a movie's details page from memory or disk, when
// it was read before (fresh or not).
func (h *Handlers) harborKeptDetails(ctx context.Context, tmdb string) (metadata.Details, bool) {
	key := "details|movie|" + tmdb
	if e, ok := h.Cache.Get(key); ok && e.Details != nil {
		return *e.Details, true
	}
	if k, ok := metadata.LoadKept[metadata.Details](ctx, h.Store, key); ok {
		h.Cache.Put(key, Entry{At: k.At, Details: &k.V})
		return k.V, true
	}
	return metadata.Details{}, false
}

// harborReadDetails reads a movie's details page from TMDB and keeps it,
// the same way a details page visit does.
func (h *Handlers) harborReadDetails(ctx context.Context, d metadata.Discoverer, tmdb string) (metadata.Details, bool) {
	det, err := d.Details(ctx, "movie", tmdb)
	if err != nil {
		return det, false
	}
	key := "details|movie|" + tmdb
	h.Cache.Put(key, Entry{At: time.Now(), Details: &det})
	metadata.KeepOnDisk(ctx, h.Store, key, det)
	return det, true
}

// idText reads a JSON-extracted id that SQLite may hand back as a number
// or as text.
func idText(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case []byte:
		return string(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case float64:
		return strconv.FormatInt(int64(x), 10)
	}
	return ""
}

// harborNames answers GET /api/v1/harbor/names: the names of every movie,
// show and artist on the shelves, for the one search's "Did you mean?".
// Kids get none (a name above their limit is not theirs to see).
func (h *Handlers) harborNames(w http.ResponseWriter, r *http.Request) {
	names := []string{}
	if h.KidMax(r) == "" {
		rows, err := h.Store.Read().QueryContext(r.Context(), `SELECT DISTINCT name FROM titles WHERE state != 'removed' AND kind IN ('movie', 'show', 'artist') AND name != '' ORDER BY name`)
		if err != nil {
			webserver.Internal(w, "discover", err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var n string
			if err := rows.Scan(&n); err != nil {
				webserver.Internal(w, "discover", err)
				return
			}
			names = append(names, n)
		}
		if err := rows.Err(); err != nil {
			webserver.Internal(w, "discover", err)
			return
		}
	}
	h.Caching(w, r, "private, max-age=600")
	webserver.WriteJSON(w, http.StatusOK, map[string]any{"names": names})
}
