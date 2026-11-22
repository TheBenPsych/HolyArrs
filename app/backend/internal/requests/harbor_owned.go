package requests

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"strings"

	"github.com/HolyArrs/holyarrs/app/backend/internal/core/database"
	domain "github.com/HolyArrs/holyarrs/app/backend/internal/core/model"
	"github.com/HolyArrs/holyarrs/app/backend/internal/library"
)

// Harbor: the "already here" checker.
//
// A request that waits for approval while its movie or show is already in
// the Library has nothing left to decide: approving it would only add what
// is already there. harborSettleOwned approves those by itself and ties
// them to their title, so the ready check that follows marks each one Ready
// once its files are in. It runs with the ready check, every 30 seconds and
// after each import, so a title that arrives by any way (a download, an
// import from the old apps, a folder added by hand and taken into the
// Library) settles its waiting requests.
//
// It only touches waiting movie and show requests that are not 4K, and it
// never starts a search or a download: the title is already in the Library.

// harborOwnedNote is the note left on a request settled this way.
const harborOwnedNote = "already in the Library, approved by Harbor"

// harborAgainNote is the note an import leaves on an old request it could
// not tie to a title; it is dropped once the request is settled.
const harborAgainNote = "approve it again here to add it"

// harborSettleOwned approves waiting requests whose title is in the Library.
// It returns how many it approved.
func (s *Service) harborSettleOwned(ctx context.Context) int {
	if s.Store == nil {
		return 0
	}
	db := s.Store.Read()
	waiting, err := database.Select[domain.Ask](ctx, db, "asks", "state = 'asked' AND kind IN ('movie', 'show') AND four_k = 0 ORDER BY id")
	if err != nil {
		log.Printf("asks: already-here check: %v", err)
		return 0
	}
	if len(waiting) == 0 {
		return 0
	}
	var owner int64
	if err := db.QueryRowContext(ctx, "SELECT id FROM users WHERE role = 'owner' AND state = 'active' ORDER BY id LIMIT 1").Scan(&owner); err != nil {
		return 0
	}
	who, _ := json.Marshal(domain.System)
	n := 0
	for _, a := range waiting {
		titleID := harborTitleFor(ctx, db, a)
		if titleID == 0 {
			continue
		}
		now := database.FormatTime(s.now())
		var moved int64
		err := s.Store.Write(ctx, func(tx *sql.Tx) error {
			res, err := tx.Exec(`UPDATE asks SET state = 'approved', title_id = ?, decided_by = ?, decided_at = ?, auto_approved = 1,
				note = ?, updated_at = ?, updated_by = ? WHERE id = ? AND state = 'asked'`,
				titleID, owner, now, harborOwnedNoteFor(a.Note), now, string(who), a.ID)
			if err == nil {
				moved, _ = res.RowsAffected()
			}
			return err
		})
		if err != nil {
			log.Printf("asks: already-here check, request %d: %v", a.ID, err)
			continue
		}
		if moved == 1 {
			n++
			s.changed(ctx, a.ID)
		}
	}
	if n > 0 {
		log.Printf("asks: approved %d waiting request(s) whose title is already in the Library", n)
	}
	return n
}

// harborTitleFor finds the Library title a request is for, or 0.
func harborTitleFor(ctx context.Context, db database.Querier, a domain.Ask) int64 {
	ids := map[string]string{}
	for k, v := range a.SourceIDs {
		ids[k] = v
	}
	if a.TMDBID != "" && ids["tmdb"] == "" {
		ids["tmdb"] = a.TMDBID
	}
	if k, v, ok := strings.Cut(a.Ref, ":"); ok && v != "" && ids[k] == "" {
		ids[k] = v
	}
	var id int64
	switch a.Kind {
	case "movie":
		if ids["tmdb"] != "" {
			id, _ = library.TitleByTMDB(ctx, db, ids["tmdb"])
		}
	case "show":
		id, _ = library.ShowByIDs(ctx, db, ids)
	}
	return id
}

// harborOwnedNoteFor keeps a request's own note, drops the import's
// "approve it again" part and says why it was approved.
func harborOwnedNoteFor(note string) string {
	keep := []string{}
	for _, part := range strings.Split(note, ";") {
		p := strings.TrimSpace(part)
		if p == "" || strings.Contains(p, harborAgainNote) || p == harborOwnedNote {
			continue
		}
		keep = append(keep, p)
	}
	keep = append(keep, harborOwnedNote)
	out := strings.Join(keep, "; ")
	if len(out) > 300 {
		out = out[len(out)-300:]
	}
	return out
}
