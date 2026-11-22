package health

// Harbor: the Tower's week of health dots and its live graphs.
//
// The week: every time the health checks run (and each time the Tower asks),
// the worst state of every link and check today is written to a small file in
// the config folder, harbor-health-week.json. The Tower reads the last 7 days
// back and draws one dot per day for each connection. Nothing else reads the
// file; deleting it only forgets the dots.
//
// The pulse: how busy Tower's processor is right now (read from /proc/stat)
// and how fast the downloads are coming in (the speeds the Downloaders last
// reported). The Tower asks every few seconds and draws the graphs itself;
// nothing is stored.

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/HolyArrs/holyarrs/app/backend/internal/core/jobs"
	"github.com/HolyArrs/holyarrs/app/backend/internal/core/webserver"
)

// harborWeekFile is the week of health dots, in the config folder.
const harborWeekFile = "harbor-health-week.json"

// harborWeekDays is how many days of dots the Tower shows.
const harborWeekDays = 7

// Tones, the same words the web app uses.
const (
	toneOK   = "ok"
	toneWait = "wait"
	toneFail = "fail"
	toneIdle = "idle"
)

var toneRank = map[string]int{"": 0, toneIdle: 1, toneOK: 2, toneWait: 3, toneFail: 4}

// harborWeek is the file: day ("2026-11-22") -> key -> worst tone that day.
type harborWeek struct {
	Days map[string]map[string]string `json:"days"`
}

var harborWeekMu sync.Mutex

// linkTone turns a link's state into a tone.
func linkTone(s jobs.State) string {
	switch s {
	case jobs.Running:
		return toneOK
	case jobs.Retrying, jobs.Starting:
		return toneWait
	case jobs.Failed:
		return toneFail
	default:
		return toneIdle
	}
}

// checkTone turns a health check's state into a tone.
func checkTone(s string) string {
	switch s {
	case OK:
		return toneOK
	case Warning:
		return toneWait
	case Error:
		return toneFail
	default:
		return toneIdle
	}
}

// worseTone keeps the worse of two tones.
func worseTone(a, b string) string {
	if toneRank[b] > toneRank[a] {
		return b
	}
	return a
}

// noteDay merges today's tones into the week and drops days older than
// the week.
func noteDay(w *harborWeek, day string, now map[string]string) {
	if w.Days == nil {
		w.Days = map[string]map[string]string{}
	}
	d := w.Days[day]
	if d == nil {
		d = map[string]string{}
		w.Days[day] = d
	}
	for k, t := range now {
		d[k] = worseTone(d[k], t)
	}
	days := make([]string, 0, len(w.Days))
	for k := range w.Days {
		days = append(days, k)
	}
	sort.Strings(days)
	for len(days) > harborWeekDays+1 {
		delete(w.Days, days[0])
		days = days[1:]
	}
}

// weekView is the last 7 days, oldest first, and each key's tone per day
// ("" when nothing was written that day).
func weekView(w harborWeek, today time.Time) map[string]any {
	days := make([]string, harborWeekDays)
	for i := range days {
		days[i] = today.AddDate(0, 0, i-harborWeekDays+1).Format("2006-01-02")
	}
	keys := map[string][]string{}
	for i, day := range days {
		for k, t := range w.Days[day] {
			if keys[k] == nil {
				keys[k] = make([]string, harborWeekDays)
			}
			keys[k][i] = t
		}
	}
	return map[string]any{"days": days, "keys": keys}
}

func (e *Engine) harborWeekPath() string {
	if e.ConfigDir == "" {
		return ""
	}
	return filepath.Join(e.ConfigDir, harborWeekFile)
}

func readWeek(path string) harborWeek {
	var w harborWeek
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &w)
	}
	return w
}

// harborNote writes today's worst tone for every link and check. It never
// fails the caller: the dots are a nice-to-have.
func (e *Engine) harborNote(ctx context.Context) harborWeek {
	path := e.harborWeekPath()
	now := map[string]string{}
	if links, err := e.Links(ctx); err == nil {
		for _, l := range links {
			now[l.Key] = linkTone(l.State)
		}
	}
	if cs, err := List(ctx, e.Store); err == nil {
		for _, c := range cs {
			now[c.Key] = checkTone(c.State)
		}
	}
	harborWeekMu.Lock()
	defer harborWeekMu.Unlock()
	var w harborWeek
	if path != "" {
		w = readWeek(path)
	}
	noteDay(&w, e.now().Format("2006-01-02"), now)
	if path == "" {
		return w
	}
	if b, err := json.Marshal(w); err == nil {
		tmp := path + ".tmp"
		if os.WriteFile(tmp, b, 0o600) == nil {
			_ = os.Rename(tmp, path)
		}
	}
	return w
}

// ----- the pulse -----

type cpuSample struct {
	busy, total uint64
	at          time.Time
}

var (
	cpuMu   sync.Mutex
	cpuLast *cpuSample
)

// readCPU reads the first line of /proc/stat: the time every processor
// spent busy and in total since start.
func readCPU() (*cpuSample, bool) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return nil, false
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	if !sc.Scan() {
		return nil, false
	}
	return parseCPU(sc.Text())
}

// parseCPU reads "cpu  user nice system idle iowait irq softirq steal ...".
func parseCPU(line string) (*cpuSample, bool) {
	f := strings.Fields(line)
	if len(f) < 5 || f[0] != "cpu" {
		return nil, false
	}
	var total, idle uint64
	for i, v := range f[1:] {
		if i >= 8 { // guest time is already counted in user
			break
		}
		n, err := strconv.ParseUint(v, 10, 64)
		if err != nil {
			return nil, false
		}
		total += n
		if i == 3 || i == 4 { // idle and iowait
			idle += n
		}
	}
	return &cpuSample{busy: total - idle, total: total, at: time.Now()}, true
}

// cpuPercent is how busy the processor was between two samples, 0 to 100.
func cpuPercent(a, b *cpuSample) int {
	if a == nil || b == nil || b.total <= a.total {
		return -1
	}
	p := float64(b.busy-a.busy) / float64(b.total-a.total) * 100
	if p < 0 {
		p = 0
	}
	if p > 100 {
		p = 100
	}
	return int(p + 0.5)
}

// cpuNow is how busy the processor is: since the last ask, or over a quick
// fifth of a second when nobody asked lately. -1 when it cannot be read.
func cpuNow() int {
	cpuMu.Lock()
	defer cpuMu.Unlock()
	last := cpuLast
	if last == nil || time.Since(last.at) > time.Minute {
		s, ok := readCPU()
		if !ok {
			return -1
		}
		last = s
		time.Sleep(200 * time.Millisecond)
	}
	s, ok := readCPU()
	if !ok {
		return -1
	}
	cpuLast = s
	if s.total-last.total == 0 {
		return -1
	}
	return cpuPercent(last, s)
}

// ----- routes -----

func (h *Handlers) harborRoutes(m *http.ServeMux) {
	m.HandleFunc("GET /api/v1/harbor/tower/week", h.harborWeek)
	m.HandleFunc("GET /api/v1/harbor/tower/pulse", h.harborPulse)
}

func (h *Handlers) harborWeek(w http.ResponseWriter, r *http.Request) {
	week := h.Engine.harborNote(r.Context())
	webserver.WriteJSON(w, http.StatusOK, weekView(week, h.Engine.now()))
}

func (h *Handlers) harborPulse(w http.ResponseWriter, r *http.Request) {
	var down, up, n int64
	_ = h.Store.Read().QueryRowContext(r.Context(),
		`SELECT COALESCE(SUM(speed), 0), COALESCE(SUM(up_speed), 0), COUNT(*) FROM downloads WHERE state = 'downloading'`).Scan(&down, &up, &n)
	webserver.WriteJSON(w, http.StatusOK, map[string]any{"cpu": cpuNow(), "down_bps": down, "up_bps": up, "downloading": n, "at": time.Now().UTC().Format(time.RFC3339)})
}
