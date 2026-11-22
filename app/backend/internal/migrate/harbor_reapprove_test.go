package migrate

import "testing"

func TestHarborCleanNote(t *testing.T) {
	for in, want := range map[string]string{
		"approved in seerr: approve it again here to add it":                        "",
		"asked by Sam in seerr; approved in seerr: approve it again here to add it": "asked by Sam in seerr",
		"a note": "a note",
	} {
		if got := harborCleanNote(in); got != want {
			t.Errorf("harborCleanNote(%q) = %q, want %q", in, got, want)
		}
	}
}
