package metadata

import (
	"net/url"
	"time"
)

// Harbor only (not part of HolyArrs): the TMDB lists behind Harbor's own
// Explore rows. Harbor names its rows harbor_*, so they never clash with
// HolyArrs's.
const (
	// HarborStreamingRow is "New on streaming this week": movies whose
	// digital release (streaming or rent) was in the last 7 days in the US.
	// That is usually when good copies show up.
	HarborStreamingRow = "harbor_streaming"
	// HarborAnimeSeasonRow is "Anime this season": Japanese animated shows
	// with an episode airing within a week either side of today.
	HarborAnimeSeasonRow = "harbor_anime_season"
)

// harborRow is the TMDB path and query for one of Harbor's rows. ok is
// false for a row Harbor does not know; an empty path means the row has
// nothing of this kind (streaming has only movies, anime only shows).
func harborRow(row, kind string, now time.Time) (path string, q url.Values, ok bool) {
	day := func(d int) string { return now.UTC().AddDate(0, 0, d).Format("2006-01-02") }
	switch row {
	case HarborStreamingRow:
		if kind != "movie" {
			return "", nil, true
		}
		return "/discover/movie", url.Values{
			"region": {"US"}, "with_release_type": {"4"},
			"release_date.gte": {day(-7)}, "release_date.lte": {day(0)},
			"sort_by": {"popularity.desc"}, "include_adult": {"false"}, "vote_count.gte": {"5"},
		}, true
	case HarborAnimeSeasonRow:
		if kind != "show" {
			return "", nil, true
		}
		return "/discover/tv", url.Values{
			"with_genres": {"16"}, "with_original_language": {"ja"},
			"air_date.gte": {day(-7)}, "air_date.lte": {day(7)},
			"sort_by": {"popularity.desc"}, "include_adult": {"false"},
		}, true
	}
	return "", nil, false
}
