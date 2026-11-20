import type pg from "pg";
import { getPool } from "@/lib/db";
import { RoomError } from "@/lib/errors";

export type RevealProgress = { step: number; total: number };

/**
 * The organizer shows the next pair. `expectedStep` is the number of pairs on the organizer's
 * screen. The update is a compare-and-set on that number, so two taps for the same pair move the
 * reveal one time, and a repeated request is safe. Returns where the reveal is now.
 */
export async function revealNext(
  code: string,
  personId: string,
  expectedStep: number,
  pool: pg.Pool = getPool(),
): Promise<RevealProgress> {
  const found = await pool.query(
    `select r.id, r.organizer_id = $2 as is_organizer,
            exists (select 1 from members m where m.room_id = r.id and m.person_id = $2) as is_inside,
            (select count(*)::int from pairs p where p.room_id = r.id) as total
       from rooms r where r.code = $1`,
    [code, personId],
  );
  const room = found.rows[0];
  if (!room || !room.is_inside) throw new RoomError("ROOM_NOT_FOUND", "This room does not exist.");
  if (!room.is_organizer) throw new RoomError("NOT_ORGANIZER", "Only the organizer can reveal the pairs.");
  if (room.total === 0) throw new RoomError("NOT_DRAWN", "Draw the names before the reveal.");

  // The pairs of a room never change after the draw, so the total stays true for this statement.
  const moved = await pool.query(
    `update rooms set reveal_step = reveal_step + 1
      where id = $1 and reveal_step = $2 and reveal_step < $3
      returning reveal_step`,
    [room.id, expectedStep, room.total],
  );
  const now = moved.rows[0] ?? (await pool.query("select reveal_step from rooms where id = $1", [room.id])).rows[0];
  return { step: now.reveal_step, total: room.total };
}
