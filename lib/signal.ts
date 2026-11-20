import { readConfig, type Config } from "@/lib/config";
import { nexconnCall } from "@/lib/nexconn-server";
import { TALK_SYSTEM_USER } from "@/lib/room-talk";
import { SIGNAL_TYPE } from "@/lib/talk-rules";

/** One signal message. `toUserIds` limits it to those people; with none, the whole room gets it. Never throws. */
async function sendSignal(code: string, toUserIds: string[] | null, keys: Config["nexconn"], send: typeof fetch): Promise<boolean> {
  if (!keys) return false;
  try {
    await nexconnCall(
      "/v4/group-channel/message/send",
      {
        fromUserId: TALK_SYSTEM_USER,
        toChannelIds: [code],
        ...(toUserIds ? { toUserIds } : {}),
        messageType: SIGNAL_TYPE,
        content: JSON.stringify({ kind: "state" }),
        shouldPersist: 0,
        disablePush: true,
      },
      keys,
      send,
    );
    return true;
  } catch (error) {
    console.error("A signal was not sent:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Tells every browser in the room to load the state again. It never throws and never blocks an
 * action: a lost signal costs up to 10 seconds, because the room screen also loads on a timer.
 * Returns true when the chat service took the signal.
 */
export function signalRoom(code: string, keys: Config["nexconn"] = readConfig().nexconn, send: typeof fetch = fetch): Promise<boolean> {
  return sendSignal(code, null, keys, send);
}

/**
 * Tells the browsers of one person to load the state again. No other member of the room gets the
 * message, and it names no sender and no thread: used for mask talk, where a signal to the whole
 * room would show who talks to whom.
 */
export function signalPerson(code: string, personId: string, keys: Config["nexconn"] = readConfig().nexconn, send: typeof fetch = fetch): Promise<boolean> {
  return sendSignal(code, [personId], keys, send);
}
