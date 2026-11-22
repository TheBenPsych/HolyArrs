package health

// Harbor: the Shrinker tab of the Tower. It looks after the video shrinker
// (Tdarr, set up on Tower by MyStream's server/tdarr/setup-tdarr.sh).
//
// Harbor never talks to Tdarr itself. A small helper on Tower
// (tdarr-watch.sh, every 2 minutes) and the setup leave a few files in
// Tdarr's folder, which Harbor's install gives it as /tdarr:
//
//	benflix-setup.json   the settings in use, the folders, the graphics card
//	benflix-status.json  is Tdarr running, paused, set up for the card
//	benflix-counts.json  how many files are queued, on hold, failed (hourly)
//	benflix-watch.log    what the helper did lately
//
// Harbor writes only into /tdarr/harbor, and the helper does the rest:
//
//	harbor/settings.env  Ben's settings; the helper runs the setup again
//	harbor/actions.txt   one line per ask: "putback /media/…", "fix unpause|hold|failed|setup"
//	harbor/skip-night    "start end" in seconds: no shrinking in between
//
// The backup folder (/tdarr-backup) holds the originals for a few days and
// shrink-log.txt, one line per shrunk file.

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/HolyArrs/holyarrs/app/backend/internal/core/webserver"
)

const shrinkWeekFile = "harbor-shrinker-week.json"

// shrinkDirs are where Tdarr's folder and the backup folder are mounted.
type shrinkDirs struct {
	app, backup string
}

func shrinkPaths() shrinkDirs {
	d := shrinkDirs{app: os.Getenv("HARBOR_TDARR_DIR"), backup: os.Getenv("HARBOR_TDARR_BACKUP")}
	if d.app == "" {
		d.app = "/tdarr"
	}
	if d.backup == "" {
		d.backup = "/tdarr-backup"
	}
	return d
}

// ShrinkSettings are the choices Ben can change on the page.
type ShrinkSettings struct {
	NightStart    int      `json:"night_start"`
	NightEnd      int      `json:"night_end"`
	EpisodeGB     float64  `json:"episode_gb"`
	MovieGB       float64  `json:"movie_gb"`
	KeepPercent   int      `json:"keep_percent"`
	MinKbps1080   int      `json:"min_kbps_1080"`
	BackupDays    int      `json:"backup_days"`
	MinFreeGB     int      `json:"min_free_gb"`
	TrimLanguages bool     `json:"trim_languages"`
	FoldersOff    []string `json:"folders_off"`
}

type shrinkSetup struct {
	At         string         `json:"at"`
	GPU        string         `json:"gpu"`
	Encoder    string         `json:"encoder"`
	Folders    []string       `json:"folders"`
	FoldersOff []string       `json:"folders_off"`
	Settings   ShrinkSettings `json:"settings"`
}

type shrinkStatus struct {
	At         string `json:"at"`
	Running    bool   `json:"running"`
	Answering  bool   `json:"answering"`
	NodePaused *bool  `json:"node_paused"`
	GPUDoCPU   *bool  `json:"gpu_do_cpu"`
	GPUWorkers *int   `json:"gpu_workers"`
	PausedFor  string `json:"paused_for"`
	SetupOK    *bool  `json:"setup_ok"`
	SetupBusy  bool   `json:"setup_busy"`
}

type shrinkCounts struct {
	At    string         `json:"at"`
	Files map[string]int `json:"files"`
}

// ShrinkFile is one shrunk file from the log.
type ShrinkFile struct {
	At        string  `json:"at"`
	Path      string  `json:"path"`
	Name      string  `json:"name"`
	BeforeGB  float64 `json:"before_gb"`
	AfterGB   float64 `json:"after_gb"`
	CanPut    bool    `json:"can_put_back"`
	PutAsked  bool    `json:"put_back_asked"`
	nightDate string
}

// ShrinkNight is one night's total.
type ShrinkNight struct {
	Date    string  `json:"date"`
	Files   int     `json:"files"`
	SavedGB float64 `json:"saved_gb"`
}

// ShrinkTile is one coloured tile.
type ShrinkTile struct {
	Key  string `json:"key"`
	Name string `json:"name"`
	Tone string `json:"tone"`
	Line string `json:"line"`
	Fix  string `json:"fix,omitempty"`
}

// ShrinkThing is one row of "Things to look at".
type ShrinkThing struct {
	Key      string `json:"key"`
	Tone     string `json:"tone"`
	Title    string `json:"title"`
	Line     string `json:"line"`
	Fix      string `json:"fix,omitempty"`
	FixLabel string `json:"fix_label,omitempty"`
}

// shrinkView is everything the Shrinker tab shows.
type shrinkView struct {
	Connected  bool            `json:"connected"`
	Why        string          `json:"why,omitempty"`
	Tone       string          `json:"tone"`
	Headline   string          `json:"headline"`
	Line       string          `json:"line"`
	SavedLast  float64         `json:"saved_last_gb"`
	Tiles      []ShrinkTile    `json:"tiles"`
	Things     []ShrinkThing   `json:"things"`
	Nights     []ShrinkNight   `json:"nights"`
	SavedWeek  float64         `json:"saved_week_gb"`
	Files      []ShrinkFile    `json:"files"`
	LastNight  string          `json:"last_night"`
	Settings   *ShrinkSettings `json:"settings"`
	Pending    bool            `json:"settings_pending"`
	Folders    []string        `json:"folders"`
	Skipping   bool            `json:"skipping_tonight"`
	Waiting    int             `json:"waiting"`
	Counts     map[string]int  `json:"counts"`
	FreeGB     float64         `json:"free_gb"`
	KeptGB     float64         `json:"kept_gb"`
	Notes      []string        `json:"notes"`
	AskedFixes []string        `json:"asked_fixes"`
	Week       map[string]any  `json:"week"`
}

func readJSONFile(path string, v any) bool {
	b, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return json.Unmarshal(b, v) == nil
}

// The log line: "2026-11-22 02:53  1.96 GB -> 1.10 GB  (saved 0.86 GB)  /media/Anime Shows/…"
var shrinkLine = regexp.MustCompile(`^(\d{4}-\d\d-\d\d) (\d\d):(\d\d)\s+([\d.]+) GB -> ([\d.]+) GB\s+\(saved [^)]*\)\s+(/media/.+)$`)

// nightOf says which night a log time belongs to: the morning it ends on.
// Files after noon belong to the next morning.
func nightOf(day string, hour int) string {
	if hour < 12 {
		return day
	}
	t, err := time.Parse("2006-01-02", day)
	if err != nil {
		return day
	}
	return t.AddDate(0, 0, 1).Format("2006-01-02")
}

// niceName turns "/media/Anime Shows/Frieren (2023)/Season 02/Frieren (2023) - S02E08 - 036 - A Magnificent End [WEBDL-1080p]….mkv"
// into "Frieren (2023) - S02E08 - 036 - A Magnificent End".
func niceName(path string) string {
	n := filepath.Base(path)
	n = strings.TrimSuffix(n, filepath.Ext(n))
	if i := strings.Index(n, " ["); i > 0 {
		n = n[:i]
	}
	if i := strings.Index(n, "{"); i > 0 {
		n = strings.TrimSpace(n[:i])
	}
	return n
}

func parseShrinkLog(path string) []ShrinkFile {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []ShrinkFile
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		m := shrinkLine.FindStringSubmatch(strings.TrimRight(sc.Text(), "\r"))
		if m == nil {
			continue
		}
		h, _ := strconv.Atoi(m[2])
		b, _ := strconv.ParseFloat(m[4], 64)
		a, _ := strconv.ParseFloat(m[5], 64)
		out = append(out, ShrinkFile{At: m[1] + " " + m[2] + ":" + m[3], Path: m[6], Name: niceName(m[6]), BeforeGB: b, AfterGB: a, nightDate: nightOf(m[1], h)})
	}
	return out
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }

// freeGB is the free space of the disk that holds dir (-1: unknown).
var freeGB = func(dir string) float64 {
	var st syscall.Statfs_t
	if syscall.Statfs(dir, &st) != nil {
		return -1
	}
	return float64(st.Bavail) * float64(st.Bsize) / 1e9
}

func keptGB(dir string) float64 {
	var n int64
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || strings.HasSuffix(p, ".txt") {
			return nil
		}
		if info, e := d.Info(); e == nil {
			n += info.Size()
		}
		return nil
	})
	return float64(n) / 1e9
}

func lastLines(path string, n int) []string {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	out := make([]string, 0, len(lines))
	for i := len(lines) - 1; i >= 0; i-- { // newest first
		if s := strings.TrimSpace(lines[i]); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// hourWord: 1 -> "1 AM", 13 -> "1 PM".
func hourWord(h int) string {
	switch {
	case h == 0:
		return "midnight"
	case h == 12:
		return "noon"
	case h < 12:
		return fmt.Sprintf("%d AM", h)
	}
	return fmt.Sprintf("%d PM", h-12)
}

func inNight(h, start, end int) bool {
	if start < end {
		return h >= start && h < end
	}
	return h >= start || h < end
}

// nextNight is the start and end of tonight's hours (or the ones running now).
func nextNight(now time.Time, start, end int) (time.Time, time.Time) {
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	s := day.Add(time.Duration(start) * time.Hour)
	length := end - start
	if length <= 0 {
		length += 24
	}
	if inNight(now.Hour(), start, end) {
		// Already working: the hours started today, or yesterday when they run past midnight
		if now.Before(s) {
			s = s.AddDate(0, 0, -1)
		}
		return s, s.Add(time.Duration(length) * time.Hour)
	}
	if !now.Before(s) {
		s = s.AddDate(0, 0, 1)
	}
	return s, s.Add(time.Duration(length) * time.Hour)
}

func gbWord(f float64) string {
	if f >= 100 {
		return fmt.Sprintf("%.0f GB", f)
	}
	return fmt.Sprintf("%.1f GB", f)
}

func shrinkCount(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

// buildShrink reads every file and works out the page. now is local time.
func buildShrink(d shrinkDirs, now time.Time) shrinkView {
	v := shrinkView{Tone: toneIdle, Tiles: []ShrinkTile{}, Things: []ShrinkThing{}, Files: []ShrinkFile{}, Nights: []ShrinkNight{}, Notes: []string{}, AskedFixes: []string{}}
	var setup shrinkSetup
	if !readJSONFile(filepath.Join(d.app, "benflix-setup.json"), &setup) {
		v.Why = "Harbor can't see the shrinker yet. Run Harbor's install command again on Tower, so Harbor gets Tdarr's folder."
		v.Headline = "Not linked to the shrinker yet"
		v.Line = v.Why
		return v
	}
	v.Connected = true
	st := setup.Settings
	v.Settings = &st
	if st.FoldersOff == nil {
		st.FoldersOff = setup.FoldersOff
	}
	if st.FoldersOff == nil {
		st.FoldersOff = []string{}
	}
	v.Folders = append(append([]string{}, setup.Folders...), setup.FoldersOff...)
	slices.Sort(v.Folders)

	// Settings saved in Harbor but not in use yet
	if saved, ok := readSavedSettings(filepath.Join(d.app, "harbor", "settings.env")); ok {
		v.Pending = !sameSettings(saved, st, setup.FoldersOff)
		if v.Pending {
			v.Settings = &saved
		}
	}

	var status shrinkStatus
	hasStatus := readJSONFile(filepath.Join(d.app, "benflix-status.json"), &status)
	statusAge := time.Duration(-1)
	if t, err := time.Parse(time.RFC3339, status.At); hasStatus && err == nil {
		statusAge = now.Sub(t)
	}
	var counts shrinkCounts
	if readJSONFile(filepath.Join(d.app, "benflix-counts.json"), &counts) {
		v.Counts = counts.Files
		v.Waiting = counts.Files["Queued"]
	}
	v.Notes = lastLines(filepath.Join(d.app, "benflix-watch.log"), 8)

	// Asks Harbor made that the helper hasn't done yet
	putAsked := map[string]bool{}
	for _, l := range lastLines(filepath.Join(d.app, "harbor", "actions.txt"), 200) {
		if p, ok := strings.CutPrefix(l, "putback "); ok {
			putAsked[p] = true
		} else if f, ok := strings.CutPrefix(l, "fix "); ok {
			v.AskedFixes = append(v.AskedFixes, f)
		}
	}

	// Skip tonight
	if b, err := os.ReadFile(filepath.Join(d.app, "harbor", "skip-night")); err == nil {
		var s, e int64
		if n, _ := fmt.Sscan(string(b), &s, &e); n == 2 && now.Unix() < e {
			v.Skipping = true
		}
	}

	// The nights and last night's files
	files := parseShrinkLog(filepath.Join(d.backup, "shrink-log.txt"))
	today := now.Format("2006-01-02")
	v.LastNight = today
	for i := 6; i >= 0; i-- {
		v.Nights = append(v.Nights, ShrinkNight{Date: now.AddDate(0, 0, -i).Format("2006-01-02")})
	}
	small := 0
	for _, f := range files {
		for i := range v.Nights {
			if v.Nights[i].Date == f.nightDate {
				v.Nights[i].Files++
				v.Nights[i].SavedGB += f.BeforeGB - f.AfterGB
			}
		}
		if f.nightDate == today {
			rel := strings.TrimPrefix(f.Path, "/media/")
			if _, err := os.Stat(filepath.Join(d.backup, filepath.FromSlash(rel))); err == nil && !strings.Contains(rel, "..") {
				f.CanPut = true
			}
			f.PutAsked = putAsked[f.Path]
			v.Files = append(v.Files, f)
			if f.AfterGB < 0.5 {
				small++
			}
		}
	}
	for i := range v.Nights {
		v.Nights[i].SavedGB = round1(v.Nights[i].SavedGB)
		v.SavedWeek += v.Nights[i].SavedGB
	}
	v.SavedWeek = round1(v.SavedWeek)
	slices.Reverse(v.Files) // newest first
	last := v.Nights[len(v.Nights)-1]
	v.SavedLast = last.SavedGB

	// Backup space
	v.FreeGB = round1(freeGB(d.backup))
	v.KeptGB = round1(keptGB(d.backup))

	// ----- the tiles -----
	nightWords := hourWord(st.NightStart) + " to " + hourWord(st.NightEnd)
	working := inNight(now.Hour(), st.NightStart, st.NightEnd)
	tdarr := ShrinkTile{Key: "tdarr", Name: "Tdarr"}
	switch {
	case !hasStatus || statusAge < 0:
		tdarr.Tone, tdarr.Line = toneFail, "No word from Tower's helper yet. Run the shrinker's setup command again."
	case statusAge > 10*time.Minute:
		tdarr.Tone, tdarr.Line = toneFail, fmt.Sprintf("No news from Tower for %d minutes. Is Tower on?", int(statusAge.Minutes()))
	case !status.Running:
		tdarr.Tone, tdarr.Line, tdarr.Fix = toneFail, "Tdarr is stopped", "setup"
	case !status.Answering:
		tdarr.Tone, tdarr.Line = toneWait, "Tdarr is starting up or not answering"
	case status.SetupBusy:
		tdarr.Tone, tdarr.Line = toneOK, "Putting in new settings…"
	case status.SetupOK != nil && !*status.SetupOK:
		tdarr.Tone, tdarr.Line, tdarr.Fix = toneWait, "The last setup run had a problem", "setup"
	case working && status.NodePaused != nil && !*status.NodePaused:
		tdarr.Tone, tdarr.Line = toneOK, "Shrinking now · until "+hourWord(st.NightEnd)
	default:
		tdarr.Tone, tdarr.Line = toneOK, "Running · works "+nightWords
	}
	gpu := ShrinkTile{Key: "gpu", Name: "Arc graphics card"}
	switch {
	case setup.Encoder == "cpu":
		gpu.Tone, gpu.Line = toneWait, "Set to use the processor instead"
	case setup.GPU == "":
		gpu.Tone, gpu.Line, gpu.Fix = toneFail, "Not found", "setup"
	case hasStatus && status.Answering && ((status.GPUDoCPU != nil && !*status.GPUDoCPU) || (status.GPUWorkers != nil && *status.GPUWorkers < 1)):
		gpu.Tone, gpu.Line, gpu.Fix = toneWait, "Found, but not set up to take files", "setup"
	default:
		gpu.Tone, gpu.Line = toneOK, "Found and in use · 1 file at a time"
	}
	watch := ShrinkTile{Key: "watch", Name: "Pause while watching"}
	switch {
	case v.Skipping:
		watch.Tone, watch.Line = toneOK, "Skipping tonight, as you asked"
	case status.PausedFor != "":
		watch.Tone, watch.Line = toneOK, "Paused: "+status.PausedFor
	case !working:
		watch.Tone, watch.Line = toneOK, "Resting until "+hourWord(st.NightStart)+" · stops when someone watches"
	case status.NodePaused != nil && *status.NodePaused:
		watch.Tone, watch.Line, watch.Fix = toneWait, "Paused by hand in Tdarr", "unpause"
	default:
		watch.Tone, watch.Line = toneOK, "Nobody watching now"
	}
	space := ShrinkTile{Key: "space", Name: "Backup space"}
	switch {
	case v.FreeGB < 0:
		space.Tone, space.Line = toneIdle, "Can't read the backup folder"
	case v.FreeGB < float64(st.MinFreeGB):
		space.Tone, space.Line = toneFail, fmt.Sprintf("%s free. Under %d GB it waits for space", gbWord(v.FreeGB), st.MinFreeGB)
	case v.FreeGB < float64(st.MinFreeGB)+150:
		space.Tone, space.Line = toneWait, fmt.Sprintf("%s free · %s of originals kept", gbWord(v.FreeGB), gbWord(v.KeptGB))
	default:
		space.Tone, space.Line = toneOK, fmt.Sprintf("%s free · %s of originals kept", gbWord(v.FreeGB), gbWord(v.KeptGB))
	}
	if space.Tone != toneOK && space.Tone != toneIdle && st.BackupDays > 1 {
		space.Fix = "fewer-days"
	}
	v.Tiles = []ShrinkTile{tdarr, gpu, watch, space}

	// ----- things to look at -----
	fixLabel := map[string]string{"setup": "Set it up again", "unpause": "Carry on", "fewer-days": fmt.Sprintf("Keep %d days", st.BackupDays-1), "hold": "Release them", "failed": "Try again"}
	for _, t := range v.Tiles {
		if t.Tone == toneWait || t.Tone == toneFail {
			v.Things = append(v.Things, ShrinkThing{Key: t.Key, Tone: t.Tone, Title: t.Name, Line: t.Line, Fix: t.Fix, FixLabel: fixLabel[t.Fix]})
		}
	}
	if n := v.Counts["Hold"]; n > 0 {
		v.Things = append(v.Things, ShrinkThing{Key: "hold", Tone: toneWait, Title: shrinkCount(n, "file is", "files are") + " on hold", Line: "Tdarr found them but is waiting before it looks at them.", Fix: "hold", FixLabel: fixLabel["hold"]})
	}
	if n := v.Counts["Transcode error"]; n > 0 {
		v.Things = append(v.Things, ShrinkThing{Key: "failed", Tone: toneWait, Title: shrinkCount(n, "file", "files") + " could not be shrunk", Line: "Their originals were left as they were. Trying again sometimes works.", Fix: "failed", FixLabel: fixLabel["failed"]})
	}
	if small > 0 {
		v.Things = append(v.Things, ShrinkThing{Key: "small", Tone: toneWait, Title: shrinkCount(small, "file", "files") + " came out under 500 MB last night", Line: "Look at the list below. Put back any that look worse."})
	}
	if v.Pending {
		v.Things = append(v.Things, ShrinkThing{Key: "pending", Tone: toneIdle, Title: "New settings are on their way", Line: "Tower puts them in within a few minutes."})
	}
	for i := range v.Things {
		if slices.Contains(v.AskedFixes, v.Things[i].Fix) {
			v.Things[i].FixLabel = ""
			v.Things[i].Line += " Asked: Tower does it within 2 minutes."
		}
	}

	// ----- the orb -----
	worst := toneOK
	looks := 0
	for _, t := range v.Things {
		if t.Tone == toneWait || t.Tone == toneFail {
			looks++
		}
		worst = worseTone(worst, t.Tone)
	}
	v.Tone = worst
	waiting := ""
	if v.Waiting > 0 {
		waiting = fmt.Sprintf(" %s files are waiting.", strconv.FormatInt(int64(v.Waiting), 10))
	}
	next := "Next run tonight at " + hourWord(st.NightStart) + "."
	if working {
		next = "It is working now, until " + hourWord(st.NightEnd) + "."
	}
	if v.Skipping {
		next = "Skipping tonight, as you asked."
	}
	lastWords := "Nothing was shrunk last night."
	if last.Files > 0 {
		lastWords = fmt.Sprintf("Last night it shrank %s and saved %s.", shrinkCount(last.Files, "file", "files"), gbWord(last.SavedGB))
	}
	switch worst {
	case toneFail:
		v.Headline = "The shrinker needs a look"
	case toneWait:
		v.Headline = shrinkCount(looks, "thing", "things") + " to look at"
	default:
		v.Headline = "The shrinker is working"
	}
	v.Line = lastWords + " " + next + waiting
	return v
}

// ----- settings -----

func readSavedSettings(path string) (ShrinkSettings, bool) {
	b, err := os.ReadFile(path)
	if err != nil {
		return ShrinkSettings{}, false
	}
	s := ShrinkSettings{TrimLanguages: true, FoldersOff: []string{}}
	for _, line := range strings.Split(string(b), "\n") {
		k, val, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		i, _ := strconv.Atoi(val)
		f, _ := strconv.ParseFloat(val, 64)
		switch k {
		case "NIGHT_START":
			s.NightStart = i
		case "NIGHT_END":
			s.NightEnd = i
		case "EPISODE_GB":
			s.EpisodeGB = f
		case "MOVIE_GB":
			s.MovieGB = f
		case "KEEP_PERCENT":
			s.KeepPercent = i
		case "MIN_KBPS_1080":
			s.MinKbps1080 = i
		case "BACKUP_DAYS":
			s.BackupDays = i
		case "MIN_FREE_GB":
			s.MinFreeGB = i
		case "TRIM_LANGUAGES":
			s.TrimLanguages = val != "false"
		case "FOLDERS_OFF":
			if val != "" {
				s.FoldersOff = strings.Split(val, "|")
			}
		}
	}
	return s, true
}

func sameSettings(a, b ShrinkSettings, bOff []string) bool {
	x, y := slices.Clone(a.FoldersOff), slices.Clone(bOff)
	slices.Sort(x)
	slices.Sort(y)
	a.FoldersOff, b.FoldersOff = nil, nil
	return fmt.Sprint(a) == fmt.Sprint(b) && slices.Equal(x, y)
}

var folderName = regexp.MustCompile(`^[][A-Za-z0-9 _.,'()&!+-]+$`)

// checkSettings says what is wrong, in words, or "".
func checkSettings(s ShrinkSettings, folders []string) string {
	switch {
	case s.NightStart < 0 || s.NightStart > 23 || s.NightEnd < 0 || s.NightEnd > 23:
		return "The hours must be between midnight and 11 PM."
	case s.NightStart == s.NightEnd:
		return "The start and end hours must be different."
	case s.EpisodeGB < 0.5 || s.EpisodeGB > 20:
		return "Episodes: pick between 0.5 and 20 GB."
	case s.MovieGB < 0.5 || s.MovieGB > 50:
		return "Movies: pick between 0.5 and 50 GB."
	case s.KeepPercent < 30 || s.KeepPercent > 80:
		return "How small: pick between 30% and 80%."
	case s.MinKbps1080 < 1500 || s.MinKbps1080 > 6000:
		return "The smallest size is out of range."
	case s.BackupDays < 1 || s.BackupDays > 14:
		return "Keep originals for 1 to 14 days."
	case s.MinFreeGB < 50 || s.MinFreeGB > 5000:
		return "Free space to keep: pick between 50 and 5000 GB."
	}
	for _, f := range s.FoldersOff {
		if !slices.Contains(folders, f) || !folderName.MatchString(f) {
			return fmt.Sprintf("There is no folder called %q.", f)
		}
	}
	return ""
}

func settingsFile(s ShrinkSettings) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Saved by Harbor's Shrinker page. Tower uses these within a few minutes.\n")
	fmt.Fprintf(&b, "NIGHT_START=%d\nNIGHT_END=%d\n", s.NightStart, s.NightEnd)
	fmt.Fprintf(&b, "EPISODE_GB=%s\nMOVIE_GB=%s\n", strconv.FormatFloat(round1(s.EpisodeGB), 'f', -1, 64), strconv.FormatFloat(round1(s.MovieGB), 'f', -1, 64))
	fmt.Fprintf(&b, "KEEP_PERCENT=%d\nMIN_KBPS_1080=%d\nBACKUP_DAYS=%d\nMIN_FREE_GB=%d\n", s.KeepPercent, s.MinKbps1080, s.BackupDays, s.MinFreeGB)
	fmt.Fprintf(&b, "TRIM_LANGUAGES=%t\nFOLDERS_OFF=%s\n", s.TrimLanguages, strings.Join(s.FoldersOff, "|"))
	return b.String()
}

var shrinkMu sync.Mutex

func writeHarborFile(d shrinkDirs, name, body string, appendTo bool) error {
	dir := filepath.Join(d.app, "harbor")
	if _, err := os.Stat(dir); err != nil {
		return errors.New("Tower's helper hasn't made Harbor's folder yet. Run the shrinker's setup command again on Tower.")
	}
	path := filepath.Join(dir, name)
	if appendTo {
		f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o664)
		if err != nil {
			return errors.New("Harbor can't write to Tdarr's folder.")
		}
		defer f.Close()
		_, err = f.WriteString(body)
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(body), 0o664); err != nil {
		return errors.New("Harbor can't write to Tdarr's folder.")
	}
	return os.Rename(tmp, path)
}

// ----- routes -----

func (h *Handlers) harborShrinkerRoutes(m *http.ServeMux) {
	m.HandleFunc("GET /api/v1/harbor/shrinker", h.harborShrinker)
	m.HandleFunc("POST /api/v1/harbor/shrinker/action", h.harborShrinkerAction)
	m.HandleFunc("PUT /api/v1/harbor/shrinker/settings", h.harborShrinkerSettings)
}

func (h *Handlers) shrinkNow() time.Time { return h.Engine.now().In(time.Local) }

func (h *Handlers) harborShrinker(w http.ResponseWriter, r *http.Request) {
	shrinkMu.Lock()
	defer shrinkMu.Unlock()
	v := buildShrink(shrinkPaths(), h.shrinkNow())
	v.Week = h.Engine.noteShrinkWeek(v)
	webserver.WriteJSON(w, http.StatusOK, v)
}

// noteShrinkWeek keeps the tiles' worst tone per day for the dots.
func (e *Engine) noteShrinkWeek(v shrinkView) map[string]any {
	var wk harborWeek
	path := ""
	if e.ConfigDir != "" {
		path = filepath.Join(e.ConfigDir, shrinkWeekFile)
		wk = readWeek(path)
	}
	if v.Connected {
		now := map[string]string{}
		for _, t := range v.Tiles {
			now[t.Key] = t.Tone
		}
		noteDay(&wk, e.now().In(time.Local).Format("2006-01-02"), now)
		if path != "" {
			if b, err := json.Marshal(wk); err == nil && os.WriteFile(path+".tmp", b, 0o600) == nil {
				_ = os.Rename(path+".tmp", path)
			}
		}
	}
	return weekView(wk, e.now().In(time.Local))
}

func (h *Handlers) harborShrinkerAction(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Action string `json:"action"`
		Fix    string `json:"fix"`
		Path   string `json:"path"`
	}
	if !webserver.Decode(w, r, &body, `send {"action": "skip" | "unskip" | "fix" | "putback"}`) {
		return
	}
	shrinkMu.Lock()
	defer shrinkMu.Unlock()
	d := shrinkPaths()
	now := h.shrinkNow()
	v := buildShrink(d, now)
	if !v.Connected {
		webserver.Fail(w, http.StatusConflict, v.Why)
		return
	}
	var err error
	switch body.Action {
	case "skip":
		s, e := nextNight(now, v.Settings.NightStart, v.Settings.NightEnd)
		err = writeHarborFile(d, "skip-night", fmt.Sprintf("%d %d\n", s.Unix(), e.Unix()), false)
	case "unskip":
		err = os.Remove(filepath.Join(d.app, "harbor", "skip-night"))
		if errors.Is(err, fs.ErrNotExist) {
			err = nil
		}
	case "fix":
		switch body.Fix {
		case "unpause", "hold", "failed", "setup":
			err = writeHarborFile(d, "actions.txt", "fix "+body.Fix+"\n", true)
		case "fewer-days":
			s := *v.Settings
			if s.BackupDays > 1 {
				s.BackupDays--
			}
			err = writeHarborFile(d, "settings.env", settingsFile(s), false)
		default:
			webserver.Fail(w, http.StatusBadRequest, "unknown fix")
			return
		}
	case "putback":
		ok := false
		for _, f := range parseShrinkLog(filepath.Join(d.backup, "shrink-log.txt")) {
			if f.Path == body.Path {
				ok = true
			}
		}
		if !ok || strings.Contains(body.Path, "..") || strings.ContainsAny(body.Path, "\n\r") {
			webserver.Fail(w, http.StatusBadRequest, "That file isn't in the shrink log.")
			return
		}
		err = writeHarborFile(d, "actions.txt", "putback "+body.Path+"\n", true)
	default:
		webserver.Fail(w, http.StatusBadRequest, "unknown action")
		return
	}
	if err != nil {
		webserver.Fail(w, http.StatusConflict, err.Error())
		return
	}
	v = buildShrink(d, now)
	v.Week = h.Engine.noteShrinkWeek(v)
	webserver.WriteJSON(w, http.StatusOK, v)
}

func (h *Handlers) harborShrinkerSettings(w http.ResponseWriter, r *http.Request) {
	var s ShrinkSettings
	if !webserver.Decode(w, r, &s, "send the shrinker settings") {
		return
	}
	shrinkMu.Lock()
	defer shrinkMu.Unlock()
	d := shrinkPaths()
	now := h.shrinkNow()
	v := buildShrink(d, now)
	if !v.Connected {
		webserver.Fail(w, http.StatusConflict, v.Why)
		return
	}
	if s.FoldersOff == nil {
		s.FoldersOff = []string{}
	}
	if msg := checkSettings(s, v.Folders); msg != "" {
		webserver.Fail(w, http.StatusBadRequest, msg)
		return
	}
	if err := writeHarborFile(d, "settings.env", settingsFile(s), false); err != nil {
		webserver.Fail(w, http.StatusConflict, err.Error())
		return
	}
	v = buildShrink(d, now)
	v.Week = h.Engine.noteShrinkWeek(v)
	webserver.WriteJSON(w, http.StatusOK, v)
}
