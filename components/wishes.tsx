"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import type { RoomState } from "@/lib/rooms";

/** The typed list lives in the room, so it survives the move of this panel into the fold at the draw. Null: nothing typed yet. */
type WishesProps = { state: RoomState; draft: string[] | null; onDraft: (draft: string[]) => void };

/** One text field for each saved wish, and one empty field when there is none. More fields come with "Add another wish". */
const fields = (saved: readonly string[]) => (saved.length > 0 ? [...saved] : [""]);

/** The member's own wish list. Only the secret giver sees it, after the draw. A guest has none. */
export function Wishes({ state, draft: typed, onDraft: setDraft }: WishesProps) {
  const id = useId();
  const { room, me, draw, wishes } = state;
  // The fields show the saved list until the member types. A later state load must not undo what the member types.
  const draft = typed ?? fields(wishes.mine);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ error: boolean; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const response = await fetch(`/api/rooms/${room.code}/wishes`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wishes: draft }),
      });
      if (response.ok) {
        const saved: { wishes: string[] } = await response.json();
        setDraft(fields(saved.wishes));
        setResult({ error: false, text: "Saved." });
      } else {
        const body: ApiError = await response.json();
        setResult({ error: true, text: body.error.message });
      }
    } catch {
      setResult({ error: true, text: "Your wishes were not saved. Check your connection and try again." });
    }
    setSending(false);
  }

  if (me.role === "guest") return null;

  if (!wishes.open) {
    return (
      <section className="panel" aria-labelledby={`${id}-title`}>
        <h2 className="panel__title" id={`${id}-title`}>
          Your wish list
        </h2>
        {wishes.mine.length === 0 ? (
          <p>You wrote no wishes.</p>
        ) : (
          <ul className="wishlist">
            {wishes.mine.map((wish) => (
              <li key={wish}>{wish}</li>
            ))}
          </ul>
        )}
        <p className="panel__warn">The reveal started, so the wish lists are closed.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby={`${id}-title`}>
      <h2 className="panel__title" id={`${id}-title`}>
        Your wish list
      </h2>
      <p>
        {draw.drawn
          ? "Only your secret giver sees these wishes. You can change them until the reveal."
          : `Write up to ${LIMITS.wishesMax} wishes. After the draw, only your secret giver sees them.`}
      </p>
      <form className="form" onSubmit={save}>
        {draft.map((wish, index) => (
          <div className="field" key={index}>
            <label className="field__label" htmlFor={`${id}-${index}`}>
              Wish {index + 1}
            </label>
            <input
              className="field__input"
              id={`${id}-${index}`}
              value={wish}
              maxLength={LIMITS.wishTextMax}
              autoComplete="off"
              onChange={(event) => {
                setDraft(draft.map((old, at) => (at === index ? event.target.value : old)));
                setResult(null);
              }}
            />
          </div>
        ))}
        <div className="form__actions">
          {draft.length < LIMITS.wishesMax && (
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setDraft([...draft, ""]);
                // The new field gets the focus after it renders.
                requestAnimationFrame(() => document.getElementById(`${id}-${draft.length}`)?.focus());
              }}
            >
              Add another wish
            </Button>
          )}
          <Button type="submit" variant="quiet" loading={sending}>
            Save wishes
          </Button>
        </div>
        <p className="field__help" role="status" data-error={result?.error ? "" : undefined}>
          {result?.text}
        </p>
      </form>
    </section>
  );
}
