package migrate

import (
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/HolyArrs/holyarrs/app/backend/internal/core/database"
)

// harborAgainNote marks a request that an earlier import brought over as
// waiting, because its title was not in the Library yet.
const harborAgainNote = "approve it again here to add it"

// harborReapprove repairs a request from an earlier import. When that import
// ran, the request's title was not in the Library, so a request the old app
// had already approved was filed as waiting and asked the owner to approve
// it again. Once a later import has brought the title over, this puts the
// request back the way the old app had it: approved, and tied to the title.
// Requests the owner has touched since (no marker note, or already decided)
// are left alone.
func (r *run) harborReapprove(askID int64, a *AskPlan, titleID int64) {
	if r.dry || !a.Approved || titleID == 0 || askID == 0 {
		return
	}
	if a.FourK && r.id("SELECT id FROM versions WHERE title_id = ? AND four_k = 1", titleID) == 0 {
		return
	}
	decidedBy := r.personID(a.Decider)
	if decidedBy <= 0 {
		decidedBy = r.owner
	}
	if decidedBy <= 0 {
		return
	}
	decided, err := r.sourceOrMoveTime(a.DecidedAt)
	if err != nil {
		decided = r.m.now()
	}
	who, _ := json.Marshal(r.by)
	now := database.FormatTime(r.m.now())
	_ = r.m.Store.Write(r.ctx, func(tx *sql.Tx) error {
		var note string
		if err := tx.QueryRow("SELECT note FROM asks WHERE id = ? AND state = 'asked' AND title_id IS NULL", askID).Scan(&note); err != nil {
			return nil // gone, decided or tied to a title already: nothing to repair
		}
		if !strings.Contains(note, harborAgainNote) {
			return nil
		}
		_, err := tx.Exec(`UPDATE asks SET state = 'approved', title_id = ?, decided_by = ?, decided_at = ?, note = ?,
			updated_at = ?, updated_by = ? WHERE id = ? AND state = 'asked' AND title_id IS NULL`,
			titleID, decidedBy, database.FormatTime(decided), harborCleanNote(note), now, string(who), askID)
		return err
	})
}

// harborCleanNote drops the "approved in <app>: approve it again here to add
// it" part of a note and keeps the rest.
func harborCleanNote(note string) string {
	var keep []string
	for _, part := range strings.Split(note, ";") {
		if p := strings.TrimSpace(part); p != "" && !strings.Contains(p, harborAgainNote) {
			keep = append(keep, p)
		}
	}
	return strings.Join(keep, "; ")
}
