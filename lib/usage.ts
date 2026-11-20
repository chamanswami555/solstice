import type pg from "pg";
import { getPool } from "@/lib/db";

/** Counts for one kind of room. A reveal counts when every pair of the room is shown. */
export type UsageRow = { rooms: number; people: number; draws: number; reveals: number };
/** `people` is every identity of the website. One person can be in rooms of more than one kind. */
export type Usage = { december: UsageRow; tonight: UsageRow; demo: UsageRow; people: number };

/**
 * The public numbers, from one query at the time of the call. Demo rooms have their own row, and
 * demo members are no people, so the two real rows count only real groups.
 */
export async function getUsage(pool: pg.Pool = getPool()): Promise<Usage> {
  const counted = await pool.query(
    `select k.kind,
            count(distinct r.id)::int as rooms,
            count(distinct m.person_id)::int as people,
            count(distinct d.room_id)::int as draws,
            (count(distinct r.id) filter (
               where d.room_id is not null
                 and r.reveal_step >= (select count(*) from pairs p where p.room_id = r.id)))::int as reveals,
            (select count(*)::int from people) as all_people
       from (values ('december'), ('tonight'), ('demo')) as k (kind)
       left join rooms r on r.kind = k.kind
       left join members m on m.room_id = r.id
       left join draws d on d.room_id = r.id
      group by k.kind`,
  );
  const row = (kind: string): UsageRow => {
    const { rooms, people, draws, reveals } = counted.rows.find((found) => found.kind === kind);
    return { rooms, people, draws, reveals };
  };
  return { december: row("december"), tonight: row("tonight"), demo: row("demo"), people: counted.rows[0].all_people };
}
