import type pg from "pg";
import { getPool } from "@/lib/db";
import { RoomError } from "@/lib/errors";
import { hashReturnSecret, newPersonId, newReturnSecret } from "@/lib/identity";
import { LIMITS } from "@/lib/limits";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export type Person = {
  personId: string;
  /** Set only when this call made the person. It is shown one time and never stored. */
  returnSecret: string | null;
};

/** Advisory lock key of the identity cap. Exported for the lock test. */
export const IDENTITY_CAP_LOCK = 7_265_002;

/**
 * Keeps the person of a valid cookie. Makes a new person when there is none in the database.
 * Call it inside a transaction: the cap check and the insert share one advisory lock, so two
 * requests cannot both take the last place.
 */
export async function ensurePerson(
  personId: string | null,
  db: Queryable,
  cap: number = LIMITS.identityCap,
): Promise<Person> {
  if (personId) {
    const known = await db.query("select 1 from people where id = $1", [personId]);
    if (known.rowCount === 1) return { personId, returnSecret: null };
  }
  await db.query("select pg_advisory_xact_lock($1)", [IDENTITY_CAP_LOCK]);
  const total = await db.query("select count(*)::int as total from people");
  if (total.rows[0].total >= cap) {
    throw new RoomError("IDENTITY_CAP", "The website is full for now. Try again later.");
  }
  const person = { personId: newPersonId(), returnSecret: newReturnSecret() };
  await db.query("insert into people (id, return_hash) values ($1, $2)", [
    person.personId,
    hashReturnSecret(person.returnSecret),
  ]);
  return person;
}

/** The return link carries the secret. The database holds only its hash. */
export async function findPersonByReturnSecret(secret: string, db: Queryable = getPool()): Promise<string | null> {
  const found = await db.query("select id from people where return_hash = $1", [hashReturnSecret(secret)]);
  return found.rows[0]?.id ?? null;
}
