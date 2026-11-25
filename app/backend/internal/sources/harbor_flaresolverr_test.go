package sources

import "testing"

func TestHarborFlareSolverr(t *testing.T) {
	t.Setenv(FlareEnv, "")
	if harborFlareSolverr() != nil {
		t.Fatal("no address set: no FlareSolverr")
	}
	t.Setenv(FlareEnv, "http://192.168.1.105:8191")
	u := harborFlareSolverr()
	if u == nil || u.Host != "192.168.1.105:8191" {
		t.Fatalf("Tower's FlareSolverr: got %v", u)
	}
	t.Setenv(FlareEnv, "not a url")
	if harborFlareSolverr() != nil {
		t.Fatal("a bad address is ignored")
	}
}
