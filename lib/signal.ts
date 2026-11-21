import { readConfig, type Config } from "@/lib/config";
import { nexconnCall } from "@/lib/nexconn-server";
import type { DrawCard } from "@/lib/draw";
import { DRAW_CARD_TYPE, SIGNAL_TYPE, TALK_SYSTEM_USER } from "@/lib/talk-rules";

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

/**
 * Sends each giver their draw card in room talk, as a targeted message: no other member gets it, and
 * the chat service keeps no history of it. One call for each giver, so one refusal (a member who has
 * not opened room talk yet is not in the channel) stops no other card. Never throws.
 * Returns the number of cards that the chat service took.
 */
export async function sendDrawCards(
  code: string,
  cards: DrawCard[],
  keys: Config["nexconn"] = readConfig().nexconn,
  send: typeof fetch = fetch,
): Promise<number> {
  if (!keys) return 0;
  let sent = 0;
  for (const card of cards) {
    try {
      await nexconnCall(
        "/v4/group-channel/message/send",
        {
          fromUserId: TALK_SYSTEM_USER,
          toChannelIds: [code],
          toUserIds: [card.personId],
          messageType: DRAW_CARD_TYPE,
          content: JSON.stringify({ receiverName: card.receiverName }),
          shouldPersist: 0,
        },
        keys,
        send,
      );
      sent += 1;
    } catch (error) {
      console.error("A draw card was not sent:", error instanceof Error ? error.message : error);
    }
  }
  return sent;
}
