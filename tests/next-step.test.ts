import { describe, expect, it } from "vitest";
import { nextStep } from "@/lib/next-step";
import type { RoomMember, RoomState } from "@/lib/rooms";

const person = (displayName: string, extra: Partial<RoomMember> = {}): RoomMember => ({
  displayName,
  isOrganizer: false,
  role: "member",
  talkId: `id-${displayName}`,
  isDemo: false,
  ...extra,
});

/** A tonight round seen by Anita, the organizer, before the draw, with only her in it. */
function state(change: Partial<RoomState> = {}): RoomState {
  const anita = person("Anita", { isOrganizer: true });
  return {
    room: { code: "ABCDEFGH", name: "Friday", kind: "tonight", exchangeDate: null, budget: null },
    me: anita,
    members: [anita],
    draw: { drawn: false, receiverName: null },
    reveal: { step: 0, total: 0, pairs: [] },
    wishes: { mine: [], receiver: null, open: true },
    note: { mine: null, open: false, notesIn: null },
    ...change,
  };
}

const rohan = person("Rohan");
const four = [person("Anita", { isOrganizer: true }), rohan, person("Meera"), person("Dev")];
const drawn = { draw: { drawn: true, receiverName: "Meera" }, members: four };

describe("nextStep before the draw", () => {
  it("tells the organizer to share the link while the room is too small", () => {
    expect(nextStep(state())).toBe("Share the invite link. A draw needs 3 people. In the room: 1.");
  });

  it("tells the organizer to draw when enough people are in", () => {
    expect(nextStep(state({ members: four }))).toBe('4 people are in. Tap "Draw names" when everyone is here.');
  });

  it("tells a member to write wishes, then to wait", () => {
    expect(nextStep(state({ me: rohan, members: four }))).toBe("Write a few wishes below. Then wait for the draw.");
    expect(nextStep(state({ me: rohan, members: four, wishes: { mine: ["Tea"], receiver: null, open: true } }))).toBe(
      "Your wishes are saved. Wait for the organizer to draw the names.",
    );
  });
});

describe("nextStep after the draw", () => {
  const tonight = { ...drawn, reveal: { step: 0, total: 4, pairs: [] } };

  it("asks a member of a tonight round for a question and a note", () => {
    expect(nextStep(state({ ...tonight, me: rohan, note: { mine: null, open: true, notesIn: null } }))).toBe(
      "You give to Meera. Ask Meera a question below, then write your gift note.",
    );
  });

  it("tells a member with a saved note to stay for the reveal", () => {
    expect(nextStep(state({ ...tonight, me: rohan, note: { mine: "A song", open: true, notesIn: null } }))).toBe(
      "Your gift note is saved. Stay here for the reveal.",
    );
  });

  it("gives the organizer the note count and the reveal button", () => {
    expect(nextStep(state({ ...tonight, note: { mine: "A song", open: true, notesIn: 2 } }))).toBe(
      'Gift notes in: 2 of 4. Tap "Reveal next" when your group is ready.',
    );
    expect(nextStep(state({ ...tonight, note: { mine: "A song", open: true, notesIn: 4 } }))).toBe(
      'All gift notes are in. Tap "Reveal next" to start the reveal.',
    );
  });

  it("asks the organizer for their own note first", () => {
    expect(nextStep(state({ ...tonight, note: { mine: null, open: true, notesIn: 3 } }))).toBe(
      "You give to Meera. Ask Meera a question below, then write your gift note.",
    );
  });

  it("names the exchange date in a December room, which has no notes", () => {
    const room = { code: "ABCDEFGH", name: "Office", kind: "december" as const, exchangeDate: "2026-12-20", budget: "500" };
    expect(nextStep(state({ ...tonight, room, me: rohan }))).toBe("You give to Meera. Ask Meera a question below. Find a gift before 2026-12-20.");
    expect(nextStep(state({ ...tonight, room }))).toBe('You give to Meera. Ask Meera a question below. On the day of the exchange, tap "Reveal next".');
  });

  it("tells a guest to watch", () => {
    const guest = person("Kabir", { role: "guest" });
    expect(nextStep(state({ ...tonight, draw: { drawn: true, receiverName: null }, me: guest }))).toBe(
      "You joined after the draw. Stay here to watch the reveal.",
    );
  });
});

describe("nextStep during and after the reveal", () => {
  it("names the newest pair, then tells the organizer to tap and the others to watch", () => {
    const pairs = [
      { giverName: "Dev", receiverName: "Anita", note: null },
      { giverName: "Meera", receiverName: "Rohan", note: "A song" },
    ];
    const during = { ...drawn, reveal: { step: 2, total: 4, pairs } };
    expect(nextStep(state(during))).toBe('Pair 2 of 4: Meera gave to Rohan. Tap "Reveal next" for the next pair.');
    expect(nextStep(state({ ...during, me: rohan }))).toBe("Pair 2 of 4: Meera gave to Rohan. Watch for the next one.");
  });

  it("points everyone to the ring at the end", () => {
    expect(nextStep(state({ ...drawn, me: rohan, reveal: { step: 4, total: 4, pairs: [] } }))).toBe(
      "The reveal is over. Scroll down to see the ring.",
    );
  });
});
