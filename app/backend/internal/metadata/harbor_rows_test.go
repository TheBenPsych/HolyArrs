package metadata

import (
	"testing"
	"time"
)

func TestHarborRow(t *testing.T) {
	now := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	p, q, ok := harborRow(HarborStreamingRow, "movie", now)
	if !ok || p != "/discover/movie" || q.Get("release_date.gte") != "2026-11-15" || q.Get("release_date.lte") != "2026-11-22" || q.Get("with_release_type") != "4" {
		t.Fatalf("streaming: %q %v %v", p, q, ok)
	}
	if p, _, ok := harborRow(HarborStreamingRow, "show", now); !ok || p != "" {
		t.Fatalf("streaming shows should be empty, got %q %v", p, ok)
	}
	p, q, ok = harborRow(HarborAnimeSeasonRow, "show", now)
	if !ok || p != "/discover/tv" || q.Get("with_genres") != "16" || q.Get("air_date.lte") != "2026-11-29" {
		t.Fatalf("anime: %q %v %v", p, q, ok)
	}
	if _, _, ok := harborRow("nope", "movie", now); ok {
		t.Fatal("unknown row should not be ok")
	}
}
