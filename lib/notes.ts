import type pg from "pg";
import { getPool, inTransaction } from "@/lib/db";
import { RoomError } from "@/lib/errors";

/**
 * Saves the gift note of a giver in a tonight round: one note or link for the person they give to.
 * An empty text takes the note away. The note stays open until the giver's own pair is revealed;
 * the row lock on the room is the lock that the reveal update needs. Safe to repeat.
 * Returns the stored note, or null when there is none now.
 */
export async function saveNote(code: string, personId: string, text: string, pool: pg.Pool = getPool()): Promise<string | null> {
  return inTransaction(async (db) => {
    const found = await db.query(
      `select r.id as room_id, r.kind, r.reveal_step, m.id as member_id, m.role, p.position
         from rooms r
         join members m on m.room_id = r.id
         left join pairs p on p.room_id = r.id and p.giver_id = m.id
        where r.code = $1 and m.person_id = $2
          for update of r`,
      [code, personId],
    );
    const mine = found.rows[0];
    if (!mine) throw new RoomError("ROOM_NOT_FOUND", "This room does not exist.");
    if (mine.kind === "december") throw new RoomError("NO_NOTES", "Gift notes are part of a tonight round.");
    if (mine.role !== "member") throw new RoomError("GUEST", "A guest gives to nobody, so a guest has no gift note.");
    if (mine.position === null) throw new RoomError("NOT_DRAWN", "Write your note after the draw.");
    if (mine.position <= mine.reveal_step) throw new RoomError("NOTE_CLOSED", "Your pair is revealed. The note is closed.");

    if (text === "") {
      await db.query("delete from gift_notes where room_id = $1 and giver_id = $2", [mine.room_id, mine.member_id]);
      return null;
    }
    await db.query(
      `insert into gift_notes (room_id, giver_id, body) values ($1, $2, $3)
       on conflict (room_id, giver_id) do update set body = excluded.body, updated_at = now()`,
      [mine.room_id, mine.member_id, text],
    );
    return text;
  }, pool);
}
