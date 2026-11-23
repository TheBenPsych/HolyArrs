package health

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func shrinkFixture(t *testing.T) (shrinkDirs, time.Time) {
	t.Helper()
	d := shrinkDirs{app: t.TempDir(), backup: t.TempDir()}
	write := func(path, body string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Date(2026, 11, 22, 9, 30, 0, 0, time.Local)
	write(filepath.Join(d.app, "benflix-setup.json"), `{"at":"x","gpu":"/dev/dri/renderD129","encoder":"qsv","folders":["Movies","TV Shows"],"folders_off":["Anime Shows"],
		"picture_check_works":false,
		"settings":{"night_start":1,"night_end":8,"episode_min_mb":400,"episode_max_mb":800,"movie_min_mb":800,"movie_max_mb":1500,"aim":"top","floor_mb_min":12,"hevc_max_cut":50,"picture_check":true,"download_sizes":"good","backup_days":3,"min_free_gb":300,"trim_languages":true}}`)
	write(filepath.Join(d.app, "benflix-status.json"), `{"at":"`+now.Add(-time.Minute).Format(time.RFC3339)+`","running":true,"answering":true,"node_paused":true,"gpu_do_cpu":true,"gpu_workers":1,"paused_for":"","setup_ok":true,"setup_busy":false}`)
	write(filepath.Join(d.app, "benflix-counts.json"), `{"at":"x","files":{"Queued":120,"Hold":2,"Transcode error":0,"Transcode success":40,"Not required":300}}`)
	write(filepath.Join(d.backup, "shrink-log.txt"), strings.Join([]string{
		"2026-11-21 02:10  2.00 GB -> 1.00 GB  (saved 1.00 GB)  /media/TV Shows/Old/S01E01 - One [WEBDL-1080p].mkv",
		"2026-11-21 23:50  3.00 GB -> 1.50 GB  (saved 1.50 GB)  /media/Movies/Late (2020)/Late (2020) {imdb-tt1} [Bluray-1080p].mkv",
		"2026-11-22 02:53  1.96 GB -> 0.30 GB  (saved 1.66 GB, picture 93)  /media/TV Shows/Show (2023)/Season 01/Show (2023) - S01E08 - End [WEBDL-1080p].mkv",
		"junk line",
	}, "\n")+"\n")
	write(filepath.Join(d.backup, "TV Shows/Show (2023)/Season 01/Show (2023) - S01E08 - End [WEBDL-1080p].mkv"), "orig")
	if err := os.MkdirAll(filepath.Join(d.app, "harbor"), 0o755); err != nil {
		t.Fatal(err)
	}
	return d, now
}

func TestShrinkNotLinked(t *testing.T) {
	v := buildShrink(shrinkDirs{app: t.TempDir(), backup: t.TempDir()}, time.Now())
	if v.Connected || v.Why == "" {
		t.Fatalf("want not linked, got %+v", v)
	}
}

func TestShrinkView(t *testing.T) {
	old := freeGB
	freeGB = func(string) float64 { return 900 }
	defer func() { freeGB = old }()
	d, now := shrinkFixture(t)
	v := buildShrink(d, now)
	if !v.Connected || len(v.Tiles) != 4 {
		t.Fatalf("not connected: %+v", v)
	}
	// Last night = the 23:50 file plus the 02:53 one.
	last := v.Nights[len(v.Nights)-1]
	if last.Date != "2026-11-22" || last.Files != 2 || last.SavedGB != 3.2 {
		t.Fatalf("last night %+v", last)
	}
	if len(v.Files) != 2 || v.Files[0].Name != "Show (2023) - S01E08 - End" || !v.Files[0].CanPut || v.Files[1].CanPut {
		t.Fatalf("files %+v", v.Files)
	}
	if v.Files[1].Name != "Late (2020)" {
		t.Fatalf("name %q", v.Files[1].Name)
	}
	keys := []string{}
	for _, th := range v.Things {
		keys = append(keys, th.Key)
	}
	if strings.Join(keys, ",") != "hold,small,picture" {
		t.Fatalf("things %v", keys)
	}
	if v.Tone != toneWait || v.Waiting != 120 {
		t.Fatalf("tone %s waiting %d", v.Tone, v.Waiting)
	}
	if v.Files[0].Picture != 93 || v.Files[1].Picture != 0 || !v.Files[1].Movie {
		t.Fatalf("picture/movie %+v", v.Files)
	}
	// The late movie came out at 1.5 GB (in the goal); the old episode at 1.0 GB is above its 800 MB goal
	if v.Goal.Shrunk != 40 || v.Goal.AlreadyFine != 300 || v.Goal.ToDo != 122 || v.Goal.Above != 1 || v.Goal.AboveFiles[0].Name != "S01E01 - One" {
		t.Fatalf("goal %+v", v.Goal)
	}
	if len(v.Folders) != 3 {
		t.Fatalf("folders %v", v.Folders)
	}
}

func TestShrinkStaleStatus(t *testing.T) {
	d, now := shrinkFixture(t)
	v := buildShrink(d, now.Add(30*time.Minute))
	if v.Tiles[0].Tone != toneFail || v.Tone != toneFail {
		t.Fatalf("want fail, got %+v", v.Tiles[0])
	}
}

func TestShrinkSettingsRoundTrip(t *testing.T) {
	d, now := shrinkFixture(t)
	s := *buildShrink(d, now).Settings
	s.NightStart, s.NightEnd = 23, 6
	s.FoldersOff = []string{"Anime Shows", "Movies"}
	if msg := checkSettings(s, []string{"Anime Shows", "Movies", "TV Shows"}); msg != "" {
		t.Fatal(msg)
	}
	if err := writeHarborFile(d, "settings.env", settingsFile(s), false); err != nil {
		t.Fatal(err)
	}
	v := buildShrink(d, now)
	if !v.Pending || v.Settings.NightStart != 23 || len(v.Settings.FoldersOff) != 2 {
		t.Fatalf("pending %v %+v", v.Pending, v.Settings)
	}
	// Same as in use: not pending.
	s.NightStart, s.NightEnd, s.FoldersOff = 1, 8, []string{"Anime Shows"}
	_ = writeHarborFile(d, "settings.env", settingsFile(s), false)
	if v := buildShrink(d, now); v.Pending {
		t.Fatalf("should not be pending: %+v", v.Settings)
	}
}

func TestShrinkCheckSettings(t *testing.T) {
	good := ShrinkSettings{NightStart: 1, NightEnd: 8, EpisodeMinMB: 400, EpisodeMaxMB: 800, MovieMinMB: 800, MovieMaxMB: 1500, Aim: "top", FloorMBMin: 12, HEVCMaxCut: 50, DownloadSizes: "good", BackupDays: 3, MinFreeGB: 300}
	bad := []func(*ShrinkSettings){
		func(s *ShrinkSettings) { s.NightEnd = 1 },
		func(s *ShrinkSettings) { s.NightStart = 24 },
		func(s *ShrinkSettings) { s.EpisodeMinMB = 900 },
		func(s *ShrinkSettings) { s.Aim = "sideways" },
		func(s *ShrinkSettings) { s.FloorMBMin = 1 },
		func(s *ShrinkSettings) { s.FoldersOff = []string{"Nope"} },
		func(s *ShrinkSettings) { s.FoldersOff = []string{"Movies\nNIGHT_START=1"} },
	}
	if msg := checkSettings(good, []string{"Movies"}); msg != "" {
		t.Fatal(msg)
	}
	for i, f := range bad {
		s := good
		f(&s)
		if checkSettings(s, []string{"Movies"}) == "" {
			t.Fatalf("case %d should fail", i)
		}
	}
}

func TestShrinkNextNight(t *testing.T) {
	at := func(h int) time.Time { return time.Date(2026, 11, 22, h, 0, 0, 0, time.Local) }
	s, e := nextNight(at(15), 1, 8)
	if s != at(1).AddDate(0, 0, 1) || e != at(8).AddDate(0, 0, 1) {
		t.Fatalf("afternoon: %v %v", s, e)
	}
	s, e = nextNight(at(3), 1, 8)
	if s != at(1) || e != at(8) {
		t.Fatalf("during: %v %v", s, e)
	}
	s, e = nextNight(at(2), 23, 6)
	if s != at(23).AddDate(0, 0, -1) || e != at(6) {
		t.Fatalf("past midnight: %v %v", s, e)
	}
	s, _ = nextNight(at(12), 23, 6)
	if s != at(23) {
		t.Fatalf("before late start: %v", s)
	}
}

func TestShrinkNightOf(t *testing.T) {
	if nightOf("2026-11-21", 23) != "2026-11-22" || nightOf("2026-11-22", 3) != "2026-11-22" {
		t.Fatal("nightOf")
	}
}
