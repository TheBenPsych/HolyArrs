package mediaservers

// Harbor's Shelves: two small answers for the poster wall.
//
//   - Plays: how often each Library title was watched on Glowfin (Jellyfin,
//     Emby or Plex), from the watch history HolyArrs already reads, so the
//     wall can sort by Most watched and Never watched.
//   - Glowfin link: where a movie or show opens in Glowfin's browser app, for
//     the play button on each poster.

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/HolyArrs/holyarrs/app/backend/internal/core/database"
	domain "github.com/HolyArrs/holyarrs/app/backend/internal/core/model"
	"github.com/HolyArrs/holyarrs/app/backend/internal/core/webserver"
	"github.com/HolyArrs/holyarrs/app/backend/internal/mediafiles"
)

// TitlePlays is how much one Library title was watched, by everyone.
type TitlePlays struct {
	ID    int64   `json:"id"`
	Plays int     `json:"plays"`
	Last  *string `json:"last,omitempty"`
}

// ShelfPlays is the play count of every watched title. Titles nobody watched
// are not listed. Enabled is false while the owner has watch history off.
type ShelfPlays struct {
	Enabled bool         `json:"enabled"`
	Titles  []TitlePlays `json:"titles"`
}

// Plays adds up watch_state per title: a show's plays are all its episodes'.
func Plays(ctx context.Context, q watchReader) (ShelfPlays, error) {
	out := ShelfPlays{Enabled: WatchHistoryOn(ctx, q), Titles: []TitlePlays{}}
	if !out.Enabled {
		return out, nil
	}
	rows, err := q.QueryContext(ctx, "SELECT title_id, sum(plays), max(last_watched_at) FROM watch_state GROUP BY title_id ORDER BY title_id")
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var p TitlePlays
		if err := rows.Scan(&p.ID, &p.Plays, &p.Last); err != nil {
			return out, err
		}
		out.Titles = append(out.Titles, p)
	}
	return out, rows.Err()
}

func (h *Handlers) shelfPlays(w http.ResponseWriter, r *http.Request) {
	out, err := Plays(r.Context(), h.Store.Read())
	if err != nil {
		internalError(w, err)
		return
	}
	webserver.WriteJSON(w, http.StatusOK, out)
}

// glowfinPort is where Glowfin's browser app listens on Tower, beside Jellyfin.
const glowfinPort = "8097"

// glowfinURL is the Glowfin page for a Jellyfin item: the same machine as the
// Jellyfin server's browser address, on Glowfin's port. Empty when the
// address cannot be read.
func glowfinURL(m domain.MediaServer, kind, item string) string {
	base := m.WebURL
	if base == "" {
		base = m.URL
	}
	u, err := url.Parse(base)
	if err != nil || u.Hostname() == "" {
		return ""
	}
	page := "#/movie/"
	if kind == "show" {
		page = "#/show/"
	}
	return "http://" + u.Hostname() + ":" + glowfinPort + "/" + page + url.PathEscape(item)
}

// GlowfinLink is where a Library title opens in Glowfin (and, as a spare, in
// Jellyfin's own page). Both are empty when no Jellyfin server has it.
type GlowfinLink struct {
	URL      string `json:"url"`
	Jellyfin string `json:"jellyfin,omitempty"`
}

// GlowfinLink finds a movie or show on the first Jellyfin server that has it.
func (l *Linker) GlowfinLink(ctx context.Context, titleID int64) (GlowfinLink, error) {
	var t mediafiles.Title
	if err := mediafiles.LoadTitle(ctx, l.Store.Read(), titleID, &t); err != nil {
		return GlowfinLink{}, err
	}
	ids := showIDs(t.SourceIDs)
	if (t.Kind != "movie" && t.Kind != "show") || len(ids) == 0 {
		return GlowfinLink{}, nil
	}
	ms, err := enabledServers(ctx, l.Store.Read())
	if err != nil {
		return GlowfinLink{}, err
	}
	for _, m := range ms {
		if m.TokenSecretID == nil || m.Kind != "jellyfin" {
			continue
		}
		item, sid, err := l.findItem(ctx, m, t.Kind, ids)
		if err != nil || item == "" {
			if ctx.Err() != nil {
				return GlowfinLink{}, ctx.Err()
			}
			continue
		}
		out := GlowfinLink{URL: glowfinURL(m, t.Kind, item)}
		if m.WebURL != "" {
			out.Jellyfin = watchURL(m, item, sid)
		}
		if out.URL != "" {
			return out, nil
		}
	}
	return GlowfinLink{}, nil
}

func (h *Handlers) glowfinLink(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.URL.Query().Get("title"), 10, 64)
	if err != nil || id <= 0 {
		webserver.Fail(w, http.StatusBadRequest, "send title, a Library title id")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	link, err := h.Linker.GlowfinLink(ctx, id)
	if errors.Is(err, database.ErrNotFound) {
		webserver.Fail(w, http.StatusNotFound, "no such title")
		return
	}
	if err != nil {
		internalError(w, err)
		return
	}
	webserver.WriteJSON(w, http.StatusOK, link)
}
