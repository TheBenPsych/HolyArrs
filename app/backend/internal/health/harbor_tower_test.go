package health

import (
	"testing"
	"time"
)

func TestHarborNoteDayKeepsWorst(t *testing.T) {
	var w harborWeek
	noteDay(&w, "2026-11-22", map[string]string{"link:source:1": toneOK, "disk": toneWait})
	noteDay(&w, "2026-11-22", map[string]string{"link:source:1": toneFail, "disk": toneOK})
	if got := w.Days["2026-11-22"]["link:source:1"]; got != toneFail {
		t.Fatalf("source = %q, want fail", got)
	}
	if got := w.Days["2026-11-22"]["disk"]; got != toneWait {
		t.Fatalf("disk = %q, want wait (the worst of the day)", got)
	}
}

func TestHarborNoteDayDropsOldDays(t *testing.T) {
	var w harborWeek
	start := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	for i := range 12 {
		noteDay(&w, start.AddDate(0, 0, i).Format("2006-01-02"), map[string]string{"k": toneOK})
	}
	if len(w.Days) != harborWeekDays+1 {
		t.Fatalf("kept %d days, want %d", len(w.Days), harborWeekDays+1)
	}
	if _, ok := w.Days["2026-11-01"]; ok {
		t.Fatal("the oldest day should be gone")
	}
}

func TestHarborWeekView(t *testing.T) {
	w := harborWeek{Days: map[string]map[string]string{
		"2026-11-22": {"k": toneOK},
		"2026-11-20": {"k": toneFail},
		"2026-11-01": {"k": toneWait}, // too old to show
	}}
	v := weekView(w, time.Date(2026, 11, 22, 9, 0, 0, 0, time.UTC))
	days := v["days"].([]string)
	if len(days) != 7 || days[0] != "2026-11-16" || days[6] != "2026-11-22" {
		t.Fatalf("days = %v", days)
	}
	k := v["keys"].(map[string][]string)["k"]
	if k[6] != toneOK || k[4] != toneFail || k[0] != "" {
		t.Fatalf("k = %v", k)
	}
}

func TestHarborCPU(t *testing.T) {
	a, ok := parseCPU("cpu  100 0 100 800 0 0 0 0 0 0")
	if !ok {
		t.Fatal("first line not read")
	}
	b, _ := parseCPU("cpu  150 0 150 900 0 0 0 0 0 0")
	if got := cpuPercent(a, b); got != 50 {
		t.Fatalf("cpu = %d, want 50", got)
	}
	if _, ok := parseCPU("intr 1 2 3"); ok {
		t.Fatal("not a cpu line")
	}
	if got := cpuPercent(b, a); got != -1 {
		t.Fatalf("backwards = %d, want -1", got)
	}
}
