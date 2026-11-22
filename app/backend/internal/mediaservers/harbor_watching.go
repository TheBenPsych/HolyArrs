package mediaservers

// Harbor: who is watching right now. Today shows a strip of the people
// playing something on Glowfin (Jellyfin or Emby) at this moment, with the
// poster and how far in they are. Read straight from the media server's own
// list of sessions each time Today asks; nothing is stored.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"

	domain "github.com/HolyArrs/holyarrs/app/backend/internal/core/model"
	"github.com/HolyArrs/holyarrs/app/backend/internal/core/webserver"
)

// Watching is one person playing something right now.
type Watching struct {
	Who     string `json:"who"`
	Device  string `json:"device"`
	Name    string `json:"name"`              // the movie, or the show
	Episode string `json:"episode,omitempty"` // "S4 E3 · The Name" for an episode
	Kind    string `json:"kind"`              // movie, show, music, other
	Percent int    `json:"percent"`           // 0 to 100
	Paused  bool   `json:"paused"`
	TitleID int64  `json:"title_id,omitempty"`
	Poster  string `json:"poster,omitempty"`
	tmdb    string // the movie's TMDB id, for finding it in the Library
}

// jellySession is the part of a Jellyfin or Emby session Today needs.
type jellySession struct {
	UserName       string `json:"UserName"`
	DeviceName     string `json:"DeviceName"`
	Client         string `json:"Client"`
	NowPlayingItem *struct {
		Name              string            `json:"Name"`
		Type              string            `json:"Type"`
		SeriesName        string            `json:"SeriesName"`
		ParentIndexNumber *int              `json:"ParentIndexNumber"`
		IndexNumber       *int              `json:"IndexNumber"`
		RunTimeTicks      int64             `json:"RunTimeTicks"`
		ProviderIDs       map[string]string `json:"ProviderIds"`
	} `json:"NowPlayingItem"`
	PlayState struct {
		PositionTicks int64 `json:"PositionTicks"`
		IsPaused      bool  `json:"IsPaused"`
	} `json:"PlayState"`
}

// watchingFrom turns a session list into the strip, leaving out sessions that
// play nothing. Paused players stay: someone is still sat in front of it.
func watchingFrom(ss []jellySession) []Watching {
	out := []Watching{}
	for _, s := range ss {
		it := s.NowPlayingItem
		if it == nil || s.UserName == "" {
			continue
		}
		w := Watching{Who: s.UserName, Device: s.DeviceName, Name: it.Name, Paused: s.PlayState.IsPaused}
		for k, v := range it.ProviderIDs {
			if strings.EqualFold(k, "tmdb") {
				w.tmdb = v
			}
		}
		if w.Device == "" {
			w.Device = s.Client
		}
		switch it.Type {
		case "Movie":
			w.Kind = "movie"
		case "Episode":
			w.Kind = "show"
			if it.SeriesName != "" {
				w.Name = it.SeriesName
				ep := ""
				if it.ParentIndexNumber != nil && it.IndexNumber != nil {
					ep = "S" + itoa(*it.ParentIndexNumber) + " E" + itoa(*it.IndexNumber)
				}
				if it.Name != "" {
					if ep != "" {
						ep += " · "
					}
					ep += it.Name
				}
				w.Episode = ep
			}
		case "Audio", "MusicVideo":
			w.Kind = "music"
		default:
			w.Kind = "other"
		}
		if it.RunTimeTicks > 0 {
			p := int(s.PlayState.PositionTicks * 100 / it.RunTimeTicks)
			w.Percent = max(0, min(100, p))
		}
		out = append(out, w)
	}
	sort.SliceStable(out, func(i, j int) bool { return strings.ToLower(out[i].Who) < strings.ToLower(out[j].Who) })
	return out
}

func itoa(n int) string { return strconv.Itoa(n) }

// sessionsOf reads one server's sessions active in the last few minutes.
func (l *Linker) sessionsOf(ctx context.Context, m domain.MediaServer) ([]jellySession, error) {
	b, err := l.do(ctx, m, http.MethodGet, "/Sessions?ActiveWithinSeconds=300", nil)
	if err != nil {
		return nil, err
	}
	var ss []jellySession
	if err := json.Unmarshal(b, &ss); err != nil {
		return nil, errors.New("the server's answer was not a session list")
	}
	return ss, nil
}

// findTitle matches what is playing to a Library title, for its poster and page.
func findTitle(ctx context.Context, db *sql.DB, kind, name, tmdb string) (int64, string) {
	var id int64
	var art string
	var err error
	if kind == "movie" && tmdb != "" {
		err = db.QueryRowContext(ctx, "SELECT id, COALESCE(artwork, '[]') FROM titles WHERE kind = 'movie' AND state != 'removed' AND json_extract(source_ids, '$.tmdb') = ? LIMIT 1", tmdb).Scan(&id, &art)
	} else {
		err = sql.ErrNoRows
	}
	if errors.Is(err, sql.ErrNoRows) && (kind == "movie" || kind == "show") {
		err = db.QueryRowContext(ctx, "SELECT id, COALESCE(artwork, '[]') FROM titles WHERE kind = ? AND state != 'removed' AND lower(name) = lower(?) LIMIT 1", kind, name).Scan(&id, &art)
	}
	if err != nil {
		return 0, ""
	}
	var list []string
	_ = json.Unmarshal([]byte(art), &list)
	if len(list) == 0 {
		return id, ""
	}
	return id, list[0]
}

// watching answers GET /api/v1/media-servers/watching: everyone playing
// something on a switched-on Jellyfin or Emby server. A server that does not
// answer is left out quietly (Today just shows fewer people), and "servers"
// says how many could be asked, so the page can stay hidden with none.
func (h *Handlers) watching(w http.ResponseWriter, r *http.Request) {
	ms, err := enabledServers(r.Context(), h.Store.Read())
	if err != nil {
		internalError(w, err)
		return
	}
	out := []Watching{}
	asked := 0
	for _, m := range ms {
		if m.Kind != "jellyfin" && m.Kind != "emby" {
			continue
		}
		asked++
		ss, err := h.Linker.sessionsOf(r.Context(), m)
		if err != nil {
			continue
		}
		list := watchingFrom(ss)
		for i := range list {
			list[i].TitleID, list[i].Poster = findTitle(r.Context(), h.Store.Read(), list[i].Kind, list[i].Name, list[i].tmdb)
		}
		out = append(out, list...)
	}
	webserver.WriteJSON(w, http.StatusOK, map[string]any{"watching": out, "servers": asked})
}
