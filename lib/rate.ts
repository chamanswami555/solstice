import { createHmac } from "node:crypto";
import type pg from "pg";
import { readConfig } from "@/lib/config";
import { getPool } from "@/lib/db";
import { LIMITS } from "@/lib/limits";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

const LOOPBACK = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);

/**
 * Counts one request for the key in the current time window and tells if it is within the limit.
 * One statement adds and reads the count, so requests at the same time get exactly `limit` slots.
 * A refused request is counted too.
 * shortcut: old windows stay in the table (one small row for each key and window), add a cleanup when the table grows.
 */
export async function takeRateSlot(db: Queryable, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const counted = await db.query(
    `insert into rate_counters (key, window_start, count)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     on conflict (key, window_start) do update set count = rate_counters.count + 1
     returning count`,
    [key, windowSeconds],
  );
  return counted.rows[0].count <= limit;
}

/**
 * The counter key for the address that the host saw for this request. The address itself is not
 * stored: the key is a keyed hash of it. Null when the request comes from the machine itself (no
 * address, or a loopback address that the framework's own server adds in a local run): such a
 * request is not limited. Behind the host every request carries the visitor's address.
 */
export function clientKey(request: Request, use: string, secret: string): string | null {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (!address || LOOPBACK.has(address)) return null;
  return `${use}:${createHmac("sha256", secret).update(`${use}:${address}`).digest("hex").slice(0, 32)}`;
}

/** True when this client address may make one more room in this hour. The call counts the request. */
export async function mayMakeRoom(request: Request): Promise<boolean> {
  const key = clientKey(request, "rooms", readConfig().sessionSecret);
  return key === null || takeRateSlot(getPool(), key, LIMITS.roomsPerHour, 3600);
}

export const TOO_MANY_ROOMS = "You made many rooms in a short time. Try again in an hour.";

/**
 * True when this request may make one more person. A caller with an identity cookie makes no new
 * person, so it is not counted (the cookie is signed, so it cannot be made up). A request with no
 * cookie counts against the limit of new people for its client address in this hour.
 */
export async function mayMakePerson(request: Request, personId: string | null): Promise<boolean> {
  if (personId) return true;
  const key = clientKey(request, "people", readConfig().sessionSecret);
  return key === null || takeRateSlot(getPool(), key, LIMITS.newPeoplePerHour, 3600);
}

export const TOO_MANY_PEOPLE = "Many new people came from your network in a short time. Try again in an hour.";
