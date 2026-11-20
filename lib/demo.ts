import type pg from "pg";
import { getPool, inTransaction } from "@/lib/db";
import { newRoomCode } from "@/lib/identity";
import { ensurePerson, type Person } from "@/lib/people";

/**
 * A demo room lets one visitor see the whole product alone. The website plays three members.
 * They are rows with no person: they have no identity, never connect to chat and count in no cap.
 */
export const DEMO_MEMBERS = [
  { name: "Asha", wishes: ["A book of short stories", "Masala chai mix"], note: "One cup of chai on me, any day this week." },
  { name: "Vikram", wishes: ["A small desk plant", "Dark chocolate"], note: "I owe you one long lunch. You pick the place." },
  { name: "Neha", wishes: ["A warm scarf", "A notebook with plain pages"], note: "A playlist for your next trip. Ask me for the link." },
] as const;

export const DEMO_ROOM_NAME = "Demo room";
export const DEMO_VISITOR_NAME = "Visitor";
/** What the visitor's secret giver asks. It is in the thread from the draw on. */
export const DEMO_QUESTION = "Demo question from your secret giver: tea or coffee?";
/** What a demo member answers to any question of the visitor. */
export const DEMO_REPLY = "Demo answer: thank you for asking. Something small and warm is right for me.";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/**
 * Starts the demo room of this visitor. A person has one demo room: a new start removes the old
 * room with everything in it, in the same transaction. A visitor with no identity gets one.
 */
export async function startDemoRoom(cookiePersonId: string | null, pool: pg.Pool = getPool()): Promise<Person & { code: string }> {
  return inTransaction(async (db) => {
    const person = await ensurePerson(cookiePersonId, db);
    // The draw goes first: its pairs point at the members, and the room takes the members with it.
    await db.query("delete from draws where room_id in (select id from rooms where organizer_id = $1 and kind = 'demo')", [person.personId]);
    await db.query("delete from rooms where organizer_id = $1 and kind = 'demo'", [person.personId]);

    const code = newRoomCode();
    const room = await db.query("insert into rooms (code, name, kind, organizer_id) values ($1, $2, 'demo', $3) returning id", [code, DEMO_ROOM_NAME, person.personId]);
    const roomId = room.rows[0].id;
    await db.query("insert into members (room_id, person_id, display_name, role) values ($1, $2, $3, 'member')", [roomId, person.personId, DEMO_VISITOR_NAME]);
    for (const demo of DEMO_MEMBERS) {
      const member = await db.query("insert into members (room_id, display_name, role, is_demo) values ($1, $2, 'member', true) returning id", [roomId, demo.name]);
      await db.query("insert into wishes (member_id, position, body) select $1, position, body from unnest($2::text[]) with ordinality as wish (body, position)", [
        member.rows[0].id,
        demo.wishes,
      ]);
    }
    return { code, ...person };
  }, pool);
}

/**
 * The part of the demo members after the draw: each demo giver has a gift note, and the visitor's
 * secret giver has asked one question. It runs inside the transaction of the draw.
 */
export async function seedDemoAfterDraw(db: Queryable, roomId: number): Promise<void> {
  for (const demo of DEMO_MEMBERS) {
    await db.query(
      `insert into gift_notes (room_id, giver_id, body)
       select p.room_id, p.giver_id, $3 from pairs p join members giver on giver.id = p.giver_id
        where p.room_id = $1 and giver.is_demo and giver.display_name = $2`,
      [roomId, demo.name, demo.note],
    );
  }
  await db.query(
    `insert into mask_messages (room_id, giver_id, from_giver, body)
     select p.room_id, p.giver_id, true, $2
       from pairs p join members giver on giver.id = p.giver_id join members receiver on receiver.id = p.receiver_id
      where p.room_id = $1 and giver.is_demo and not receiver.is_demo`,
    [roomId, DEMO_QUESTION],
  );
}
