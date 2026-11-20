import type pg from "pg";
import { getPool, inTransaction } from "@/lib/db";
import { RoomError } from "@/lib/errors";
import { LIMITS } from "@/lib/limits";

/** A thread is named from the caller's side: "giving" is the talk with the person they give to. */
export type MaskSide = "giving" | "receiving";

/** `mine` takes the place of a sender: the receiver gets no id and no name of the giver. */
export type MaskMessage = { id: number; mine: boolean; body: string; sentAt: string };

/**
 * What one person may see of one thread. This type is the allow-list of the mask routes.
 * `withName` is null for the secret giver until the last pair of the reveal is shown.
 */
export type MaskThread = { side: MaskSide; withName: string | null; muted: boolean; mutedByMe: boolean; messages: MaskMessage[] };
export type MaskThreads = { giving: MaskThread | null; receiving: MaskThread | null };

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

/** The threads of the caller: the pair where they give and the pair where they receive. */
async function threadsOf(db: Queryable, code: string, personId: string): Promise<MaskThreads> {
  const found = await db.query(
    `select giver.person_id = $2 as i_give,
            p.muted_by,
            -- The mask: the giver's name leaves the database only for the giver, or after the full reveal.
            case when giver.person_id = $2 then receiver.display_name
                 when r.reveal_step >= (select count(*) from pairs every where every.room_id = r.id) then giver.display_name
            end as with_name,
            (select coalesce(json_agg(json_build_object('id', latest.id, 'fromGiver', latest.from_giver, 'body', latest.body, 'sentAt', latest.created_at)
                                      order by latest.id), '[]'::json)
               from (select * from mask_messages message
                      where message.room_id = p.room_id and message.giver_id = p.giver_id
                      order by message.id desc limit $3) latest) as messages
       from rooms r
       join pairs p on p.room_id = r.id
       join members giver on giver.id = p.giver_id
       join members receiver on receiver.id = p.receiver_id
      where r.code = $1 and (giver.person_id = $2 or receiver.person_id = $2)`,
    [code, personId, LIMITS.maskHistory],
  );
  const threads: MaskThreads = { giving: null, receiving: null };
  for (const row of found.rows) {
    const side: MaskSide = row.i_give ? "giving" : "receiving";
    threads[side] = {
      side,
      withName: row.with_name,
      muted: row.muted_by !== null,
      mutedByMe: row.muted_by === (row.i_give ? "giver" : "receiver"),
      messages: row.messages.map((message: { id: number; fromGiver: boolean; body: string; sentAt: string }) => ({
        id: message.id,
        mine: message.fromGiver === row.i_give,
        body: message.body,
        sentAt: message.sentAt,
      })),
    };
  }
  return threads;
}

/** Returns null for a person who is not in the room. A member with no pair (before the draw, a guest) gets two nulls. */
export async function getMaskThreads(code: string, personId: string, pool: pg.Pool = getPool()): Promise<MaskThreads | null> {
  const inside = await pool.query("select 1 from rooms r join members m on m.room_id = r.id where r.code = $1 and m.person_id = $2", [code, personId]);
  if (inside.rowCount === 0) return null;
  return threadsOf(pool, code, personId);
}

/**
 * Stores one mask message of the caller in the thread of that side. The lock on the caller's own
 * member row puts the caller's posts in a line, so the count for the rate limit is exact.
 * Returns the thread as the caller sees it, and the person to signal.
 * Not safe to repeat: a second call stores a second message.
 */
export async function postMaskMessage(
  code: string,
  personId: string,
  side: MaskSide,
  text: string,
  pool: pg.Pool = getPool(),
): Promise<{ thread: MaskThread; otherPersonId: string }> {
  return inTransaction(async (db) => {
    const me = (
      await db.query("select m.id, m.room_id from rooms r join members m on m.room_id = r.id where r.code = $1 and m.person_id = $2 for update of m", [code, personId])
    ).rows[0];
    if (!me) throw new RoomError("ROOM_NOT_FOUND", "This room does not exist.");

    const iGive = side === "giving";
    const pair = (
      await db.query(
        `select p.giver_id, p.muted_by, other.person_id as other_person
           from pairs p
           join members other on other.id = case when $3 then p.receiver_id else p.giver_id end
          where p.room_id = $1 and case when $3 then p.giver_id else p.receiver_id end = $2`,
        [me.room_id, me.id, iGive],
      )
    ).rows[0];
    if (!pair) throw new RoomError("NO_THREAD", "You have no thread on this side. Threads open after the draw.");
    if (pair.muted_by !== null) throw new RoomError("THREAD_MUTED", "This thread is muted.");

    const recent = await db.query(
      `select count(*)::int as sent
         from mask_messages message
         join pairs p on p.room_id = message.room_id and p.giver_id = message.giver_id
        where message.created_at > now() - interval '1 minute'
          and ((p.giver_id = $1 and message.from_giver) or (p.receiver_id = $1 and not message.from_giver))`,
      [me.id],
    );
    if (recent.rows[0].sent >= LIMITS.maskPerMinute) {
      throw new RoomError("RATE_LIMITED", "You are sending messages fast. Wait a minute and try again.");
    }

    await db.query("insert into mask_messages (room_id, giver_id, from_giver, body) values ($1, $2, $3, $4)", [me.room_id, pair.giver_id, iGive, text]);
    return { thread: (await threadsOf(db, code, personId))[side]!, otherPersonId: pair.other_person };
  }, pool);
}
