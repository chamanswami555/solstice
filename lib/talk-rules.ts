/** Chat rules that the server and the browser share. No server code here. */
import { LIMITS } from "@/lib/limits";

/** The custom message type of a signal. A signal says "load the state again" and carries no room data. */
export const SIGNAL_TYPE = "Solstice:Signal";

/** Owner of every room channel and sender of every message from the website itself. */
export const TALK_SYSTEM_USER = "solsticeSystem";

/** The custom message type of a draw card: sent by the website to one giver only, with that giver's receiver. */
export const DRAW_CARD_TYPE = "Solstice:DrawCard";

/** Reads the receiver name of a draw card. Anything but a name a member can have is null. */
export function parseDrawCard(content: unknown): string | null {
  const name = (content as { receiverName?: unknown } | null)?.receiverName;
  return typeof name === "string" && name.trim().length > 0 && name.length <= LIMITS.displayNameMax ? name : null;
}

/** The custom message type of a cheer at the reveal. Its content is only the reveal step it cheers. */
export const CHEER_TYPE = "Solstice:Cheer";

/** Reads the step of a cheer that another browser sent. Anything but a step a room can have is null. */
export function parseCheerStep(content: unknown): number | null {
  const step = (content as { step?: unknown } | null)?.step;
  return Number.isInteger(step) && (step as number) >= 1 && (step as number) <= LIMITS.roomPeopleMax ? (step as number) : null;
}
