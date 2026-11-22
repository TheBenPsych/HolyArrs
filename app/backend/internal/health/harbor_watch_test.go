package health

import "testing"

func TestHarborWatchOnlyReadsTheSwitch(t *testing.T) {
	t.Setenv("HARBOR_WATCH_ONLY", "")
	if harborWatchOnly() {
		t.Fatal("watch-only must be off unless the switch is set")
	}
	t.Setenv("HARBOR_WATCH_ONLY", "1")
	if !harborWatchOnly() {
		t.Fatal("watch-only must be on when the switch is set")
	}
}
