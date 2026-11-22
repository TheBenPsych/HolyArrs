package health

import "os"

// harborWatchOnly reports whether Harbor runs in watch-only mode (the
// installer sets HARBOR_WATCH_ONLY for the practice week). The media folder
// is then handed over read-only on purpose, so a Library folder that cannot
// be written to is expected and is not a problem to report.
func harborWatchOnly() bool {
	switch os.Getenv("HARBOR_WATCH_ONLY") {
	case "1", "yes", "true":
		return true
	}
	return false
}
