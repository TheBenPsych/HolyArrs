package library

import "os"

// WatchOnlyEnv turns on Harbor's watch-only mode. Harbor's installer sets it
// for the practice week, when the media folder is handed over read-only so
// that Harbor cannot change a file while the old apps still do the work.
const WatchOnlyEnv = "HARBOR_WATCH_ONLY"

// watchOnly reports whether a read-only Library folder still counts as
// usable: in watch-only mode Harbor lists the titles that are already in the
// folder and never places a file there, so not being able to write is
// expected. Anything that does try to write is refused by the folder itself.
func watchOnly(h Health) bool {
	if h.State != "read_only" {
		return false
	}
	switch os.Getenv(WatchOnlyEnv) {
	case "1", "yes", "true":
		return true
	}
	return false
}
