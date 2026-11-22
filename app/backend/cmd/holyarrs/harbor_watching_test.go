package main

import "testing"

// Harbor's Today asks who is watching on Glowfin right now. It names people
// and what they play, so only people who manage the Library may ask.
// route: GET /api/v1/media-servers/watching
func TestHarborWatchingOverHTTP(t *testing.T) {
	t.Parallel()
	r := newAskRig(t)
	r.ana.call("GET", "/api/v1/media-servers/watching", "", 403)
	r.owner.call("GET", "/api/v1/media-servers/watching", "", 200)
}
