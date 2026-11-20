import type pg from "pg";
import { readConfig, type Config, type NexconnRegion } from "@/lib/config";
import { getPool } from "@/lib/db";
import { RoomError } from "@/lib/errors";
import { nexconnCall, NexconnError } from "@/lib/nexconn-server";

/** What the browser needs to connect to the talk of one room. The App Key is public by design. */
export type TalkAccess = { appKey: string; region: NexconnRegion; userId: string; token: string; channelId: string };

/** Owner of every room channel. No member owns a channel, so a member who leaves changes nothing. */
export const TALK_SYSTEM_USER = "solsticeSystem";

// Answers of Nexconn for a channel id, seen in the smoke test on the real app.
const CHANNEL_MISSING = 25410;
const CHANNEL_EXISTS = 25409;

/**
 * Gives a member the access token for room talk and makes sure the member is in the channel of the
 * room. The channel is made on the first call, so a room from before the keys arrived works too.
 * Safe to repeat: a second call issues a new token and changes nothing else.
 */
export async function openRoomTalk(
  code: string,
  personId: string,
  pool: pg.Pool = getPool(),
  keys: Config["nexconn"] = readConfig().nexconn,
  send: typeof fetch = fetch,
): Promise<TalkAccess> {
  if (!keys) throw new RoomError("CHAT_OFF", "Room talk is switched off.");
  const found = await pool.query(
    `select r.name, m.display_name
       from rooms r join members m on m.room_id = r.id
      where r.code = $1 and m.person_id = $2`,
    [code, personId],
  );
  if (found.rowCount === 0) throw new RoomError("ROOM_NOT_FOUND", "This room does not exist.");
  const { name, display_name: displayName } = found.rows[0];

  const call = <Result>(path: string, body: unknown) => nexconnCall<Result>(path, body, keys, send);
  const refusal = (wanted: number) => (error: unknown) => {
    if (error instanceof NexconnError && error.code === wanted) return wanted;
    throw error;
  };
  const join = () => call("/v4/group-channel/join", { channelId: code, userIds: [personId] });

  const issued = await call<{ accessToken: string }>("/v4/auth/access-token/issue", { userId: personId, name: displayName });
  if ((await join().catch(refusal(CHANNEL_MISSING))) === CHANNEL_MISSING) {
    const made = await call("/v4/group-channel/create", { channelId: code, name, owner: TALK_SYSTEM_USER, userIds: [personId] }).catch(
      refusal(CHANNEL_EXISTS),
    );
    // Another member made the channel between our two calls: join it.
    if (made === CHANNEL_EXISTS) await join();
  }
  return { appKey: keys.appKey, region: keys.region, userId: personId, token: issued.accessToken, channelId: code };
}

/**
 * Ends room talk for a person who was removed from the room: out of the channel, and every token
 * of that person ends (a later room gets a new token). Never throws: the removal in our database
 * is done, and the token route refuses this person for this room in any case.
 */
export async function closeRoomTalk(code: string, personId: string, keys: Config["nexconn"] = readConfig().nexconn, send: typeof fetch = fetch): Promise<void> {
  if (!keys) return;
  try {
    await nexconnCall("/v4/group-channel/leave", { channelId: code, userIds: [personId] }, keys, send);
    await nexconnCall("/v4/auth/access-token/expire", { userIds: [personId], expiresAt: Date.now() }, keys, send);
  } catch (error) {
    console.error("Room talk was not closed for a removed member:", error instanceof Error ? error.message : error);
  }
}
