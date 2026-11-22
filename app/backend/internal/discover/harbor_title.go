package discover

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"

	"github.com/HolyArrs/holyarrs/app/backend/internal/core/webserver"
)

// Harbor only (not part of HolyArrs): the "What you have" card on a title
// page (build list part 6, "file details in plain words"). It sums up the
// files a title has on disk so the page can say "1080p, 1.4 GB each,
// Japanese and English sound, English subtitles" without codes.

// HarborFileFacts is what the files of one title have, summed up.
type HarborFileFacts struct {
	// Files counts the main files on disk (one per movie copy or episode).
	Files int `json:"files"`
	// Resolution is the most common picture size ("1080p"); Mixed is true
	// when the files do not all share it.
	Resolution string `json:"resolution,omitempty"`
	Mixed      bool   `json:"mixed,omitempty"`
	HDR        string `json:"hdr,omitempty"`
	VideoCodec string `json:"video_codec,omitempty"`
	// SizeTotal and SizeEach are in bytes; SizeEach is the average.
	SizeTotal int64 `json:"size_total"`
	SizeEach  int64 `json:"size_each"`
	// Audio holds the sound languages, most common first; Channels the most
	// common layout ("5.1", "2.0").
	Audio     []string `json:"audio"`
	Channels  string   `json:"channels,omitempty"`
	Subtitles []string `json:"subtitles"`
	Forced    bool     `json:"forced,omitempty"`
}

type harborCounter map[string]int

func (c harborCounter) add(s string) {
	if s != "" {
		c[s]++
	}
}

func (c harborCounter) ranked() []string {
	out := make([]string, 0, len(c))
	for k := range c {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool {
		if c[out[i]] != c[out[j]] {
			return c[out[i]] > c[out[j]]
		}
		return out[i] < out[j]
	})
	return out
}

func (c harborCounter) top() string {
	if r := c.ranked(); len(r) > 0 {
		return r[0]
	}
	return ""
}

func harborStrings(v any) []string {
	list, _ := v.([]any)
	out := make([]string, 0, len(list))
	for _, x := range list {
		if s, ok := x.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

// harborTitleFiles answers GET /api/v1/harbor/title-files?title=<id>.
// Kids get an empty answer.
func (h *Handlers) harborTitleFiles(w http.ResponseWriter, r *http.Request) {
	out := HarborFileFacts{Audio: []string{}, Subtitles: []string{}}
	id, err := strconv.ParseInt(r.URL.Query().Get("title"), 10, 64)
	if err != nil || id <= 0 {
		webserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "title is needed"})
		return
	}
	if h.KidMax(r) != "" {
		webserver.WriteJSON(w, http.StatusOK, out)
		return
	}
	db := h.Store.Read()
	rows, err := db.QueryContext(r.Context(), `SELECT f.id, f.size, COALESCE(f.media_info, '{}') FROM files f
		WHERE f.state = 'present' AND f.role = 'main' AND f.version_id IN (SELECT id FROM versions WHERE title_id = ?)`, id)
	if err != nil {
		webserver.Internal(w, "discover", err)
		return
	}
	res, hdr, codec, audio, chans, subs := harborCounter{}, harborCounter{}, harborCounter{}, harborCounter{}, harborCounter{}, harborCounter{}
	var ids []int64
	for rows.Next() {
		var fid, size int64
		var raw string
		if err := rows.Scan(&fid, &size, &raw); err != nil {
			rows.Close()
			webserver.Internal(w, "discover", err)
			return
		}
		ids = append(ids, fid)
		out.Files++
		out.SizeTotal += size
		info := map[string]any{}
		_ = json.Unmarshal([]byte(raw), &info)
		if s, ok := info["resolution"].(string); ok {
			res.add(s)
		}
		if s, ok := info["hdr"].(string); ok {
			hdr.add(s)
		}
		if s, ok := info["video_codec"].(string); ok {
			codec.add(s)
		}
		if s, ok := info["audio_channels"].(string); ok {
			chans.add(s)
		}
		for _, l := range harborStrings(info["audio_languages"]) {
			audio.add(l)
		}
		for _, l := range harborStrings(info["subtitle_languages"]) {
			subs.add(l)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		webserver.Internal(w, "discover", err)
		return
	}
	if out.Files > 0 {
		out.SizeEach = out.SizeTotal / int64(out.Files)
	}
	out.Resolution, out.Mixed = res.top(), len(res) > 1
	out.HDR, out.VideoCodec, out.Channels = hdr.top(), codec.top(), chans.top()
	out.Audio = audio.ranked()
	// Subtitles saved beside the files count too.
	if len(ids) > 0 {
		srows, err := db.QueryContext(r.Context(), `SELECT s.language, s.forced FROM subtitles s
			JOIN files f ON f.id = s.file_id
			WHERE s.state = 'present' AND f.state = 'present' AND f.version_id IN (SELECT id FROM versions WHERE title_id = ?)`, id)
		if err == nil {
			for srows.Next() {
				var lang string
				var forced bool
				if srows.Scan(&lang, &forced) == nil {
					if forced {
						out.Forced = true
					} else {
						subs.add(lang)
					}
				}
			}
			srows.Close()
		}
	}
	out.Subtitles = subs.ranked()
	webserver.WriteJSON(w, http.StatusOK, out)
}
