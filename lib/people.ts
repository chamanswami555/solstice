import type pg from "pg";
import { getPool } from "@/lib/db";
import { hashReturnSecret, newPersonId, newReturnSecret } from "@/lib/identity";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export type Person = {
  personId: string;
  /** Set only when this call made the person. It is shown one time and never stored. */
  returnSecret: string | null;
};

/** Keeps the person of a valid cookie. Makes a new person when there is none in the database. */
export async function ensurePerson(personId: string | null, db: Queryable): Promise<Person> {
  if (personId) {
    const known = await db.query("select 1 from people where id = $1", [personId]);
    if (known.rowCount === 1) return { personId, returnSecret: null };
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
