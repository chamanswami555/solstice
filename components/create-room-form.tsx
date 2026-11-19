"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceCards, type Choice } from "@/components/ui/choice-cards";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type RoomKind = "december" | "tonight";

const KINDS: readonly Choice<RoomKind>[] = [
  { value: "december", title: "December room", hint: "Set a date and a budget." },
  { value: "tonight", title: "Tonight round", hint: "About 15 minutes. The gift is a note." },
];

// The same caps as the checks in db/migrations/001_init.sql.
const ROOM_NAME_MAX = 60;
const DISPLAY_NAME_MAX = 30;
const BUDGET_MAX = 40;

/** The fields that can be wrong, in the order of the screen. */
const CHECKED_FIELDS = ["roomName", "displayName", "exchangeDate"] as const;
type Errors = Partial<Record<(typeof CHECKED_FIELDS)[number], string>>;

/** Today as yyyy-mm-dd in the time zone of the visitor, the form that a date input gives. */
function localToday(): string {
  const now = new Date();
  const twoDigits = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
}

/** The server checks every value again. These checks only save the visitor a round trip. */
function findErrors(data: FormData): Errors {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const errors: Errors = {};

  if (text("roomName") === "") errors.roomName = "Enter a name for the room.";
  if (text("displayName") === "") errors.displayName = "Enter the name your group knows you by.";
  if (data.get("kind") === "december") {
    const date = text("exchangeDate");
    if (date === "") errors.exchangeDate = "Pick the date of the exchange.";
    else if (date <= localToday()) errors.exchangeDate = "Pick a date after today.";
  }
  return errors;
}

export function CreateRoomForm() {
  const [kind, setKind] = useState<RoomKind>("tonight");
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const found = findErrors(new FormData(form));
    setErrors(found);

    const firstWrong = CHECKED_FIELDS.find((name) => found[name]);
    if (firstWrong) {
      setNotice(null);
      (form.elements.namedItem(firstWrong) as HTMLInputElement | null)?.focus();
      return;
    }

    // TODO: send the values to POST /api/rooms, then open the new room.
    // Until that route exists, the form sends nothing and says so.
    setNotice("Nothing was sent. This form is not connected yet.");
  }

  /** A field shows no error before the first submit. After it, each change checks the marked fields again. */
  function handleInput(event: FormEvent<HTMLFormElement>) {
    setNotice(null);
    if (Object.keys(errors).length === 0) return;
    const found = findErrors(new FormData(event.currentTarget));
    setErrors((shown) => {
      const kept: Errors = {};
      for (const name of CHECKED_FIELDS) {
        if (shown[name] && found[name]) kept[name] = found[name];
      }
      return kept;
    });
  }

  return (
    <form className="form" aria-label="Create a room" noValidate onSubmit={handleSubmit} onInput={handleInput}>
      <Field
        label="Room name"
        name="roomName"
        placeholder="Office exchange 2026"
        hint="Your group sees this name."
        maxLength={ROOM_NAME_MAX}
        autoComplete="off"
        required
        error={errors.roomName}
      />
      <Field
        label="Your display name"
        name="displayName"
        placeholder="Anita"
        hint="Your group sees you by this name."
        maxLength={DISPLAY_NAME_MAX}
        autoComplete="nickname"
        required
        error={errors.displayName}
      />
      <ChoiceCards legend="Kind of room" name="kind" options={KINDS} value={kind} onChange={setKind} />
      {kind === "december" && (
        <div className="form__more">
          <Field
            label="Exchange date"
            name="exchangeDate"
            type="date"
            hint="The day you swap gifts."
            required
            error={errors.exchangeDate}
          />
          <Field
            label="Budget (optional)"
            name="budget"
            placeholder="500 rupees"
            hint="A guide for each gift."
            maxLength={BUDGET_MAX}
            autoComplete="off"
          />
        </div>
      )}
      <Button type="submit">Create room</Button>
      {notice && <Notice>{notice}</Notice>}
    </form>
  );
}
