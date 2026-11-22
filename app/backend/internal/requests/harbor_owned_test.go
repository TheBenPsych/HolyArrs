package requests

import "testing"

func TestHarborOwnedNoteFor(t *testing.T) {
	for in, want := range map[string]string{
		"": harborOwnedNote,
		"approved in seerr: approve it again here to add it":                        harborOwnedNote,
		"asked by Sam in seerr; approved in seerr: approve it again here to add it": "asked by Sam in seerr; " + harborOwnedNote,
		harborOwnedNote: harborOwnedNote,
	} {
		if got := harborOwnedNoteFor(in); got != want {
			t.Errorf("harborOwnedNoteFor(%q) = %q, want %q", in, got, want)
		}
	}
}
