package library

import "testing"

func TestWatchOnlyMakesReadOnlyFoldersUsable(t *testing.T) {
	ro := Health{State: "read_only"}
	if ro.Usable() {
		t.Fatal("a read-only folder must not be usable outside watch-only mode")
	}
	t.Setenv(WatchOnlyEnv, "1")
	if !ro.Usable() {
		t.Fatal("a read-only folder must be usable in watch-only mode")
	}
	if (Health{State: "missing"}).Usable() {
		t.Fatal("a missing folder is never usable")
	}
}
