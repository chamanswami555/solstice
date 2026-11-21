/** Chat rules that the server and the browser share. No server code here. */
import { LIMITS } from "@/lib/limits";

/** The custom message type of a signal. A signal says "load the state again" and carries no room data. */
export const SIGNAL_TYPE = "Solstice:Signal";

/** The custom message type of a cheer at the reveal. Its content is only the reveal step it cheers. */
export const CHEER_TYPE = "Solstice:Cheer";

/** Reads the step of a cheer that another browser sent. Anything but a step a room can have is null. */
export function parseCheerStep(content: unknown): number | null {
  const step = (content as { step?: unknown } | null)?.step;
  return Number.isInteger(step) && (step as number) >= 1 && (step as number) <= LIMITS.roomPeopleMax ? (step as number) : null;
}
