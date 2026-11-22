import { DRAW_MIN_MEMBERS } from "@/lib/draw-rules";
import type { RoomState } from "@/lib/rooms";

/** One sentence at the top of the room: what this person does now. Client-safe: it imports only types and a constant. */
export function nextStep({ room, me, members, draw, reveal, wishes, note }: RoomState): string {
  if (draw.drawn && reveal.step > 0) {
    if (reveal.step === reveal.total) return "The reveal is over. Scroll down to see the ring.";
    // The newest pair is public now. Naming it here gives a screen reader the names: this line is a live status.
    const shown = reveal.pairs[reveal.pairs.length - 1];
    const out = shown ? `Pair ${reveal.step} of ${reveal.total}: ${shown.giverName} gave to ${shown.receiverName}.` : `Pair ${reveal.step} of ${reveal.total} is out.`;
    return me.isOrganizer ? `${out} Tap "Reveal next" for the next pair.` : `${out} Watch for the next one.`;
  }

  if (draw.drawn) {
    if (!draw.receiverName) return "You joined after the draw. Stay here to watch the reveal.";
    const ask = `You give to ${draw.receiverName}. Ask ${draw.receiverName} a question below`;
    // A December room has no gift notes; its reveal is on the day of the exchange.
    if (room.kind === "december") {
      return me.isOrganizer ? `${ask}. On the day of the exchange, tap "Reveal next".` : `${ask}. Find a gift before ${room.exchangeDate}.`;
    }
    if (note.open && !note.mine) return `${ask}, then write your gift note.`;
    if (!me.isOrganizer) return "Your gift note is saved. Stay here for the reveal.";
    return note.notesIn !== null && note.notesIn < reveal.total
      ? `Gift notes in: ${note.notesIn} of ${reveal.total}. Tap "Reveal next" when your group is ready.`
      : 'All gift notes are in. Tap "Reveal next" to start the reveal.';
  }

  const inRoom = members.filter((member) => member.role === "member").length;
  if (me.isOrganizer) {
    return inRoom < DRAW_MIN_MEMBERS
      ? `Share the invite link. A draw needs ${DRAW_MIN_MEMBERS} people. In the room: ${inRoom}.`
      : `${inRoom} people are in. Tap "Draw names" when everyone is here.`;
  }
  return wishes.mine.length === 0 ? "Write a few wishes below. Then wait for the draw." : "Your wishes are saved. Wait for the organizer to draw the names.";
}
