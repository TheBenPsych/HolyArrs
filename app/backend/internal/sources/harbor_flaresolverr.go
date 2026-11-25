package sources

import (
	"net/url"
	"os"
)

// Harbor (Ben 2026-11-24): Tower already runs FlareSolverr for Prowlarr.
// Harbor's installer finds that container and hands its address over as
// HARBOR_FLARESOLVERR, so every Source without its own FlareSolverr address
// uses Tower's when a site shows its bot check. A Source's own address
// still wins. Nothing is sent to FlareSolverr unless the site shows the
// check (see flaresolverr.go).

// FlareEnv names Tower's FlareSolverr address.
const FlareEnv = "HARBOR_FLARESOLVERR"

// harborFlareSolverr is Tower's FlareSolverr, or nil when there is none or
// the address is not a plain http(s) one.
func harborFlareSolverr() *url.URL {
	raw := os.Getenv(FlareEnv)
	if raw == "" {
		return nil
	}
	clean, err := ParseFlareSolverr(raw)
	if err != nil {
		return nil
	}
	u, err := url.Parse(clean)
	if err != nil {
		return nil
	}
	return u
}
