"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import type { RoomState } from "@/lib/rooms";

/** A note that is one web address becomes a link. Any other note stays plain text. */
export function NoteText({ text }: { text: string }) {
  return /^https?:\/\/\S+$/.test(text) ? (
    <a href={text} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    <>{text}</>
  );
}

/** The gift of a tonight round: one note or link that the giver writes for the person they give to. */
export function GiftNote({ state }: { state: RoomState }) {
  const id = useId();
  const { room, me, draw, note } = state;
  // The field starts from the saved note one time. A later state load must not undo what the giver types.
  const [draft, setDraft] = useState(note.mine ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ error: boolean; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const response = await fetch(`/api/rooms/${room.code}/note`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      if (response.ok) {
        const saved: { note: string | null } = await response.json();
        setDraft(saved.note ?? "");
        setResult({ error: false, text: saved.note ? "Saved." : "No note now." });
      } else {
        const body: ApiError = await response.json();
        setResult({ error: true, text: body.error.message });
      }
    } catch {
      setResult({ error: true, text: "Your note was not saved. Check your connection and try again." });
    }
    setSending(false);
  }

  if (room.kind !== "tonight" || me.role !== "member" || !draw.receiverName) return null;

  if (!note.open) {
    return (
      <section className="panel" aria-labelledby={`${id}-title`}>
        <h2 className="panel__title" id={`${id}-title`}>
          Your gift note for {draw.receiverName}
        </h2>
        <p>{note.mine ? <NoteText text={note.mine} /> : "You wrote no note."}</p>
        <p className="panel__warn">Your pair is revealed, so the note is closed.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby={`${id}-title`}>
      <h2 className="panel__title" id={`${id}-title`}>
        Your gift note for {draw.receiverName}
      </h2>
      <p>Tonight the gift is a note or a link. {draw.receiverName} sees it at the reveal, with your name.</p>
      <form className="form" onSubmit={save}>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-text`}>
            Gift note
          </label>
          <textarea
            className="field__input field__input--area"
            id={`${id}-text`}
            value={draft}
            maxLength={LIMITS.noteTextMax}
            rows={3}
            onChange={(event) => {
              setDraft(event.target.value);
              setResult(null);
            }}
          />
        </div>
        <div>
          <Button type="submit" variant="quiet" loading={sending}>
            Save note
          </Button>
        </div>
        <p className="field__help" role="status" data-error={result?.error ? "" : undefined}>
          {result?.text}
        </p>
      </form>
    </section>
  );
}
