import { randomInt } from "node:crypto";
import type pg from "pg";
import { getPool, inTransaction } from "@/lib/db";
import { DRAW_MIN_MEMBERS } from "@/lib/draw-rules";
import { RoomError } from "@/lib/errors";

export type Pair = {
  giverId: number;
  receiverId: number;
  /** Order of the reveal, from 1. It is shuffled apart from the ring, so nobody can predict the next giver. */
  position: number;
};

/** Fisher-Yates with a random source that has no bias. */
function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let last = result.length - 1; last > 0; last -= 1) {
    const pick = randomInt(last + 1);
    [result[last], result[pick]] = [result[pick], result[last]];
  }
  return result;
}

/** One ring: each member gives to the next one in a shuffled order, so nobody draws their own name. */
export function drawPairs(memberIds: readonly number[]): Pair[] {
  if (memberIds.length < DRAW_MIN_MEMBERS) {
    throw new RoomError("TOO_FEW_MEMBERS", `A draw needs ${DRAW_MIN_MEMBERS} or more members.`);
  }
  const ring = shuffled(memberIds);
  const positions = shuffled(ring.map((_, index) => index + 1));
  return ring.map((giverId, index) => ({
    giverId,
    receiverId: ring[(index + 1) % ring.length],
    position: positions[index],
  }));
}

/**
 * The organizer draws the names. The row lock on the room is the same lock that a join takes, so
 * no member can land inside a draw. The primary key of `draws` refuses a second draw in any case.
 */
export async function drawRoom(code: string, personId: string, pool: pg.Pool = getPool()): Promise<void> {
  await inTransaction(async (db) => {
    const room = await db.query(
      `select r.id, r.organizer_id = $2 as is_organizer,
              exists (select 1 from members m where m.room_id = r.id and m.person_id = $2) as is_inside
         from rooms r where r.code = $1 for update`,
      [code, personId],
    );
    if (room.rowCount === 0 || !room.rows[0].is_inside) throw new RoomError("ROOM_NOT_FOUND", "This room does not exist.");
    if (!room.rows[0].is_organizer) throw new RoomError("NOT_ORGANIZER", "Only the organizer can draw the names.");
    const roomId = room.rows[0].id;

    const drawn = await db.query("select 1 from draws where room_id = $1", [roomId]);
    if (drawn.rowCount === 1) throw new RoomError("ALREADY_DRAWN", "The names are already drawn.");

    const members = await db.query("select id from members where room_id = $1 and role = 'member' order by id", [roomId]);
    const pairs = drawPairs(members.rows.map((row) => row.id));

    await db.query("insert into draws (room_id) values ($1)", [roomId]);
    await db.query(
      `insert into pairs (room_id, giver_id, receiver_id, position)
       select $1, * from unnest($2::bigint[], $3::bigint[], $4::int[])`,
      [roomId, pairs.map((pair) => pair.giverId), pairs.map((pair) => pair.receiverId), pairs.map((pair) => pair.position)],
    );
  }, pool);
}
