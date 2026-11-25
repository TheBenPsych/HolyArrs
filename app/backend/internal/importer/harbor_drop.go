package importer

import (
	"os"
	"path/filepath"
	"strings"
)

// Harbor's drop folder (Ben 2026-11-24, idea from HolyArrs 1.3's watched
// folders). Tower's installer makes a "Drop" folder next to the media and
// hands it to Harbor at HARBOR_DROP_DIR. Harbor looks through it with the
// other watched folders every 5 minutes: a movie or episode file whose
// title is on the shelves and still needs that file is named and moved to
// its place. Anything Harbor is not sure about stays in the folder, for
// Import files by hand.
//
// In watch-only mode (the practice week) Harbor never places a file, so the
// drop folder waits until Harbor takes over from the old apps.

// DropEnv names the drop folder inside the container.
const DropEnv = "HARBOR_DROP_DIR"

const watchOnlyEnv = "HARBOR_WATCH_ONLY" // the same switch as library.WatchOnlyEnv

// harborDropFolders is the drop folder to watch, when there is one and
// Harbor may place files.
func harborDropFolders() []string {
	p := strings.TrimSpace(os.Getenv(DropEnv))
	if p == "" || !filepath.IsAbs(p) || HarborDropWaiting() {
		return nil
	}
	return []string{filepath.Clean(p)}
}

// HarborDropWaiting reports whether the drop folder is set but waits for
// Harbor to leave watch-only mode.
func HarborDropWaiting() bool {
	if strings.TrimSpace(os.Getenv(DropEnv)) == "" {
		return false
	}
	switch os.Getenv(watchOnlyEnv) {
	case "1", "yes", "true":
		return true
	}
	return false
}

// withHarborDrop adds the drop folder to the watched folders once.
func withHarborDrop(list []string) []string {
	for _, d := range harborDropFolders() {
		seen := false
		for _, p := range list {
			if filepath.Clean(p) == d {
				seen = true
				break
			}
		}
		if !seen {
			list = append(list, d)
		}
	}
	return list
}
