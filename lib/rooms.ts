import type pg from "pg";
import { getPool, inTransaction } from "@/lib/db";
import { newRoomCode } from "@/lib/identity";
import { ensurePerson } from "@/lib/people";
import type { CreateRoomInput, RoomKind } from "@/lib/validate";

export type CreatedRoom = {
  code: string;
  personId: string;
  /** Set only for a new person. */
  returnSecret: string | null;
};

/**
 * What one person may see of a room. This type is the allow-list: a route returns this object and
 * nothing else, so no database row and no person id reaches a browser.
 */
export type RoomState = {
  room: { code: string; name: string; kind: RoomKind; exchangeDate: string | null; budget: string | null };
  me: { displayName: string; isOrganizer: boolean };
  members: { displayName: string; isOrganizer: boolean }[];
};

/** One action, one transaction: the person, the room and the organizer's membership commit together. */
export async function createRoom(
  input: CreateRoomInput,
  cookiePersonId: string | null,
  pool: pg.Pool = getPool(),
): Promise<CreatedRoom> {
  return inTransaction(async (db) => {
    const person = await ensurePerson(cookiePersonId, db);
    const code = newRoomCode();
    const room = await db.query(
      `insert into rooms (code, name, kind, exchange_date, budget, organizer_id)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [code, input.roomName, input.kind, input.exchangeDate, input.budget, person.personId],
    );
    await db.query("insert into members (room_id, person_id, display_name, role) values ($1, $2, $3, 'member')", [
      room.rows[0].id,
      person.personId,
      input.displayName,
    ]);
    return { code, ...person };
  }, pool);
}

/** Returns null for a room that does not exist and for a person who is not in it. The two look the same. */
export async function getRoomState(code: string, personId: string, pool: pg.Pool = getPool()): Promise<RoomState | null> {
  const rows = await pool.query(
    `select r.code, r.name, r.kind, to_char(r.exchange_date, 'YYYY-MM-DD') as exchange_date, r.budget,
            m.display_name, m.person_id = r.organizer_id as is_organizer, m.person_id = $2 as is_me
       from rooms r
       join members m on m.room_id = r.id
      where r.code = $1
      order by m.joined_at, m.id`,
    [code, personId],
  );
  // The one access check: a caller with no member row in this room gets nothing.
  const mine = rows.rows.find((row) => row.is_me);
  if (!mine) return null;

  const member = (row: { display_name: string; is_organizer: boolean }) => ({
    displayName: row.display_name,
    isOrganizer: row.is_organizer,
  });
  return {
    room: { code: mine.code, name: mine.name, kind: mine.kind, exchangeDate: mine.exchange_date, budget: mine.budget },
    me: member(mine),
    members: rows.rows.map(member),
  };
}
