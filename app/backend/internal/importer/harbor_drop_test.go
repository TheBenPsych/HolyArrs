package importer

import "testing"

func TestHarborDropFolders(t *testing.T) {
	t.Setenv(DropEnv, "")
	t.Setenv(watchOnlyEnv, "")
	if got := withHarborDrop([]string{"/a"}); len(got) != 1 {
		t.Fatalf("no drop folder set: got %v", got)
	}
	t.Setenv(DropEnv, "/drop/")
	got := withHarborDrop([]string{"/a"})
	if len(got) != 2 || got[1] != "/drop" {
		t.Fatalf("drop folder added: got %v", got)
	}
	if got := withHarborDrop([]string{"/drop"}); len(got) != 1 {
		t.Fatalf("drop folder added twice: got %v", got)
	}
	t.Setenv(watchOnlyEnv, "1")
	if !HarborDropWaiting() || len(withHarborDrop(nil)) != 0 {
		t.Fatal("watch-only mode must not place files from the drop folder")
	}
	t.Setenv(DropEnv, "drop")
	t.Setenv(watchOnlyEnv, "")
	if len(withHarborDrop(nil)) != 0 {
		t.Fatal("a relative drop folder is ignored")
	}
}
