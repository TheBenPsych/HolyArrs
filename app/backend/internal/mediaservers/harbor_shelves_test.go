package mediaservers

import (
	"testing"

	domain "github.com/HolyArrs/holyarrs/app/backend/internal/core/model"
)

func TestGlowfinURL(t *testing.T) {
	cases := []struct {
		m          domain.MediaServer
		kind, want string
	}{
		{domain.MediaServer{URL: "http://192.168.1.105:8096"}, "movie", "http://192.168.1.105:8097/#/movie/abc"},
		{domain.MediaServer{URL: "http://jellyfin:8096", WebURL: "https://192.168.1.105:8920/jf"}, "show", "http://192.168.1.105:8097/#/show/abc"},
		{domain.MediaServer{URL: "nonsense"}, "movie", ""},
	}
	for _, c := range cases {
		if got := glowfinURL(c.m, c.kind, "abc"); got != c.want {
			t.Errorf("glowfinURL(%q, %q) = %q, want %q", c.m.URL, c.kind, got, c.want)
		}
	}
}
