"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import type { RoomState } from "@/lib/rooms";

type WishesProps = { state: RoomState };

/** One text field for each possible wish, filled with the saved ones first. */
const fields = (saved: readonly string[]) => Array.from({ length: LIMITS.wishesMax }, (_, index) => saved[index] ?? "");

/** The member's own wish list. Only the secret giver sees it, after the draw. A guest has none. */
export function Wishes({ state }: WishesProps) {
  const id = useId();
  const { room, me, draw, wishes } = state;
  // The fields start from the saved list one time. A later state load must not undo what the member types.
  const [draft, setDraft] = useState(() => fields(wishes.mine));
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
        <div>
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
