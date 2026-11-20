import type pg from "pg";
import { getPool, inTransaction } from "@/lib/db";
import { RoomError } from "@/lib/errors";
import { newRoomCode } from "@/lib/identity";
import { LIMITS } from "@/lib/limits";
import { ensurePerson, type Person } from "@/lib/people";
import type { RevealedPair } from "@/lib/reveal-rules";
import type { CreateRoomInput, RoomKind } from "@/lib/validate";

export type CreatedRoom = {
  code: string;
  personId: string;
  /** Set only for a new person. */
  returnSecret: string | null;
};

/**
 * What one person may see of a room. This type is the allow-list: a route returns this object and
 * nothing else, so no database row reaches a browser.
 */
export type RoomState = {
  room: { code: string; name: string; kind: RoomKind; exchangeDate: string | null; budget: string | null };
  me: RoomMember;
  members: RoomMember[];
  /** After the draw: the one name this person gives to. Null for a guest and before the draw. */
  draw: { drawn: boolean; receiverName: string | null };
  /** The pairs shown so far, in the order of the reveal. Every person in the room gets the same ones. */
  reveal: { step: number; total: number; pairs: RevealedPair[] };
  /**
   * This person's own wishes, and after the draw the wishes of the one person they give to.
   * `open` is true while this person can still change their wishes.
   */
  wishes: { mine: string[]; receiver: string[] | null; open: boolean };
  /**
   * The caller's own gift note of a tonight round, and `open` while they can still change it.
   * `notesIn` is the number of notes in the room, for the organizer only: a count and no text.
   */
  note: { mine: string | null; open: boolean; notesIn: number | null };
};

/**
 * A guest joined after the draw: room talk and the reveal, and no pair.
 * The talk id is the user id that chat messages carry. Every member of the room sees it in the chat in any case.
 */
export type RoomMember = { displayName: string; isOrganizer: boolean; role: "member" | "guest"; talkId: string };

export { RoomError };

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
            m.display_name, m.role, m.person_id, m.person_id = r.organizer_id as is_organizer, m.person_id = $2 as is_me,
            exists (select 1 from draws d where d.room_id = r.id) as drawn,
            (select receiver.display_name
               from pairs p
               join members giver on giver.id = p.giver_id
               join members receiver on receiver.id = p.receiver_id
              where p.room_id = r.id and giver.person_id = $2) as receiver_name,
            r.reveal_step,
            (select count(*)::int from pairs p where p.room_id = r.id) as pair_count,
            (select coalesce(json_agg(json_build_object('giverName', giver.display_name, 'receiverName', receiver.display_name,
                                                        'note', (select n.body from gift_notes n where n.room_id = p.room_id and n.giver_id = p.giver_id))
                                      order by p.position), '[]'::json)
               from pairs p
               join members giver on giver.id = p.giver_id
               join members receiver on receiver.id = p.receiver_id
              where p.room_id = r.id and p.position <= r.reveal_step) as revealed,
            (select coalesce(json_agg(w.body order by w.position), '[]'::json)
               from wishes w where w.member_id = m.id) as my_wishes,
            (select coalesce(json_agg(w.body order by w.position), '[]'::json)
               from pairs p
               join members giver on giver.id = p.giver_id
               left join wishes w on w.member_id = p.receiver_id
              where p.room_id = r.id and giver.person_id = $2 and w.member_id is not null) as receiver_wishes,
            (select p.position from pairs p where p.room_id = r.id and p.giver_id = m.id) as my_position,
            (select n.body from gift_notes n where n.room_id = r.id and n.giver_id = m.id) as my_note,
            (select count(*)::int from gift_notes n where n.room_id = r.id) as notes_in
       from rooms r
       join members m on m.room_id = r.id
      where r.code = $1
      order by m.joined_at, m.id`,
    [code, personId],
  );
  // The one access check: a caller with no member row in this room gets nothing.
  const mine = rows.rows.find((row) => row.is_me);
  if (!mine) return null;

  const member = (row: { display_name: string; is_organizer: boolean; role: RoomMember["role"]; person_id: string }): RoomMember => ({
    displayName: row.display_name,
    isOrganizer: row.is_organizer,
    role: row.role,
    talkId: row.person_id,
  });
  return {
    room: { code: mine.code, name: mine.name, kind: mine.kind, exchangeDate: mine.exchange_date, budget: mine.budget },
    me: member(mine),
    members: rows.rows.map(member),
    draw: { drawn: mine.drawn, receiverName: mine.receiver_name },
    reveal: { step: mine.reveal_step, total: mine.pair_count, pairs: mine.revealed },
    wishes: {
      mine: mine.my_wishes,
      // Null for a person with no receiver: before the draw, and a guest.
      receiver: mine.receiver_name === null ? null : mine.receiver_wishes,
      open: mine.role === "member" && mine.reveal_step === 0,
    },
    note: {
      mine: mine.my_note,
      open: mine.kind === "tonight" && mine.my_position !== null && mine.my_position > mine.reveal_step,
      notesIn: mine.kind === "tonight" && mine.is_organizer ? mine.notes_in : null,
    },
  };
}

/** What a person outside the room may see: enough to know that the invite link is the right one. */
export async function getRoomDoor(code: string, pool: pg.Pool = getPool()): Promise<{ code: string; name: string } | null> {
  const found = await pool.query("select code, name from rooms where code = $1", [code]);
  return found.rows[0] ?? null;
}

/**
 * Adds the person to the room. The row lock on the room is the same lock that the draw takes, so
 * a join cannot land inside a draw, and two joins cannot both take the last place.
 */
export async function joinRoom(
  code: string,
  displayName: string,
  cookiePersonId: string | null,
  pool: pg.Pool = getPool(),
): Promise<Person> {
  return inTransaction(async (db) => {
    const room = await db.query("select id from rooms where code = $1 for update", [code]);
    if (room.rowCount === 0) throw new RoomError("ROOM_NOT_FOUND", "This room does not exist.");
    const roomId = room.rows[0].id;

    if (cookiePersonId) {
      const already = await db.query("select 1 from members where room_id = $1 and person_id = $2", [roomId, cookiePersonId]);
      if (already.rowCount === 1) return { personId: cookiePersonId, returnSecret: null };
    }

    const facts = await db.query(
      `select (select count(*)::int from members where room_id = $1) as people,
              exists (select 1 from draws where room_id = $1) as drawn`,
      [roomId],
    );
    if (facts.rows[0].people >= LIMITS.roomPeopleMax) {
      throw new RoomError("ROOM_FULL", `This room is full. A room holds ${LIMITS.roomPeopleMax} people.`);
    }

    const person = await ensurePerson(cookiePersonId, db);
    try {
      await db.query("insert into members (room_id, person_id, display_name, role) values ($1, $2, $3, $4)", [
        roomId,
        person.personId,
        displayName,
        facts.rows[0].drawn ? "guest" : "member",
      ]);
    } catch (error) {
      if ((error as { constraint?: string }).constraint === "members_room_name_key") {
        throw new RoomError("NAME_TAKEN", "This name is taken in this room. Use another one.");
      }
      throw error;
    }
    return person;
  }, pool);
}
