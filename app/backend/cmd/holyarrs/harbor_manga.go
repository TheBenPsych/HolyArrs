package main

import (
	"context"
	"net/http"
	"sync"

	harbormanga "github.com/HolyArrs/holyarrs/app/backend/harbor/manga"
)

// Harbor only (not part of HolyArrs): the manga lane. It is off unless
// Harbor's installer sets HARBOR_MANGA_DIR.
var (
	harborMangaOnce sync.Once
	harborMangaSvc  *harbormanga.Service
)

// harborMangaRoutes registers the manga routes and, the first time, starts
// the librarian that keeps the tidy manga folder up to date.
func harborMangaRoutes(m *http.ServeMux) {
	harborMangaOnce.Do(func() {
		harborMangaSvc = harbormanga.FromEnv()
		if harborMangaSvc != nil {
			go harborMangaSvc.Run(context.Background())
		}
	})
	harborMangaSvc.Routes(m)
}
