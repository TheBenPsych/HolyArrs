package main

import "testing"

// Harbor's Shelves read play counts and where a title opens in Glowfin. Both
// say what the family watches or name the server's address, so only people
// who manage the Library may ask.
// route: GET /api/v1/harbor/shelves/plays
// route: GET /api/v1/harbor/shelves/glowfin
func TestHarborShelvesOverHTTP(t *testing.T) {
	t.Parallel()
	r := newAskRig(t)
	r.ana.call("GET", "/api/v1/harbor/shelves/plays", "", 403)
	r.owner.call("GET", "/api/v1/harbor/shelves/plays", "", 200)
	r.ana.call("GET", "/api/v1/harbor/shelves/glowfin?title=1", "", 403)
	r.owner.call("GET", "/api/v1/harbor/shelves/glowfin", "", 400)
	r.owner.call("GET", "/api/v1/harbor/shelves/glowfin?title=999999", "", 404)
}
