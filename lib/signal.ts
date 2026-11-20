import { readConfig, type Config } from "@/lib/config";
import { nexconnCall } from "@/lib/nexconn-server";
import { TALK_SYSTEM_USER } from "@/lib/room-talk";
import { SIGNAL_TYPE } from "@/lib/talk-rules";

/**
 * Tells every browser in the room to load the state again. It never throws and never blocks an
 * action: a lost signal costs up to 10 seconds, because the room screen also loads on a timer.
 * Returns true when the chat service took the signal.
 */
export async function signalRoom(code: string, keys: Config["nexconn"] = readConfig().nexconn, send: typeof fetch = fetch): Promise<boolean> {
  if (!keys) return false;
  try {
    await nexconnCall(
      "/v4/group-channel/message/send",
      {
        fromUserId: TALK_SYSTEM_USER,
        toChannelIds: [code],
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
