import type pg from "pg";
import { getPool, inTransaction } from "@/lib/db";
import { RoomError } from "@/lib/errors";

/**
 * Replaces the wish list of a member with the given wishes, in their order. An empty list clears it.
 * The row lock on the room is the lock that the reveal update needs, so no wish lands after the
 * reveal started. Safe to repeat: the same list gives the same rows.
 */
export async function saveWishes(code: string, personId: string, wishes: readonly string[], pool: pg.Pool = getPool()): Promise<string[]> {
  return inTransaction(async (db) => {
    const found = await db.query(
      `select r.reveal_step, m.id as member_id, m.role
         from rooms r join members m on m.room_id = r.id
        where r.code = $1 and m.person_id = $2
          for update of r`,
      [code, personId],
    );
    const mine = found.rows[0];
    if (!mine) throw new RoomError("ROOM_NOT_FOUND", "This room does not exist.");
    if (mine.role !== "member") throw new RoomError("GUEST", "A guest has no secret giver, so a guest has no wish list.");
    if (mine.reveal_step > 0) throw new RoomError("WISHES_CLOSED", "The reveal started. The wish lists are closed.");

    await db.query("delete from wishes where member_id = $1", [mine.member_id]);
    await db.query("insert into wishes (member_id, position, body) select $1, position, body from unnest($2::text[]) with ordinality as wish (body, position)", [
      mine.member_id,
      wishes,
    ]);
    return [...wishes];
  }, pool);
}
