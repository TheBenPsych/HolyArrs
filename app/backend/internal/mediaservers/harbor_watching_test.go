package mediaservers

import (
	"encoding/json"
	"testing"
)

func TestWatchingFrom(t *testing.T) {
	raw := `[
	 {"UserName":"Mom","DeviceName":"Living room TV","NowPlayingItem":{"Name":"Wicked","Type":"Movie","RunTimeTicks":1000,"ProviderIds":{"Tmdb":"402431"}},"PlayState":{"PositionTicks":640}},
	 {"UserName":"jake","Client":"Glowfin","NowPlayingItem":{"Name":"The Hunt","Type":"Episode","SeriesName":"Dan Da Dan","ParentIndexNumber":2,"IndexNumber":3,"RunTimeTicks":0},"PlayState":{"IsPaused":true}},
	 {"UserName":"Sam","DeviceName":"Phone"}
	]`
	var ss []jellySession
	if err := json.Unmarshal([]byte(raw), &ss); err != nil {
		t.Fatal(err)
	}
	got := watchingFrom(ss)
	if len(got) != 2 {
		t.Fatalf("want 2 people (Sam plays nothing), got %d", len(got))
	}
	if got[0].Who != "jake" || got[0].Name != "Dan Da Dan" || got[0].Episode != "S2 E3 · The Hunt" || got[0].Kind != "show" || !got[0].Paused || got[0].Device != "Glowfin" {
		t.Errorf("episode: %+v", got[0])
	}
	if got[1].Who != "Mom" || got[1].Kind != "movie" || got[1].Percent != 64 || got[1].tmdb != "402431" {
		t.Errorf("movie: %+v", got[1])
	}
}
