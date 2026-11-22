"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NoteText } from "@/components/gift-note";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { ApiError } from "@/lib/http";
import { isBeforeExchangeDate, ringOrder } from "@/lib/reveal-rules";
import type { RoomState } from "@/lib/rooms";

/** Cheers for the step on screen. `send` is null while room talk is not open: then no cheer is shown. */
export type CheerView = { send: (() => Promise<boolean>) | null; mine: boolean; names: string[] };
type RevealProps = { state: RoomState; onMoved: () => Promise<void>; cheer: CheerView };

/** The cheer button and who cheered this step. */
function Cheers({ cheer }: { cheer: CheerView }) {
  const [failed, setFailed] = useState(false);
  if (!cheer.send) return null;
  const send = cheer.send;
  return (
    <div className="cheers">
      {!cheer.mine && (
        <Button variant="quiet" onClick={async () => setFailed(!(await send().catch(() => false)))}>
          Send a cheer
        </Button>
      )}
      <p className="field__help" role="status">
        {failed ? "The cheer was not sent. Try again." : cheer.names.length > 0 ? `Cheers from ${new Intl.ListFormat("en").format(cheer.names)}.` : ""}
      </p>
    </div>
  );
}

/** After the draw: the organizer shows one pair for each tap, and every screen shows the same pairs. */
export function Reveal({ state, onMoved, cheer }: RevealProps) {
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const stage = useRef<HTMLElement>(null);
  const { room, me, reveal, note } = state;

  // A new pair brings every screen to the reveal, wherever the person had scrolled, and plays the reveal motion again.
  useEffect(() => {
    if (reveal.step === 0 || !stage.current) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A person typing keeps their place; the next-step line at the top still names the new pair.
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    if (!typing) stage.current.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    for (const animation of stage.current.getAnimations({ subtree: true })) {
      animation.cancel();
      animation.play();
    }
  }, [reveal.step]);
  // In a tonight round each pair comes with the giver's note, or with the words for a missing one.
  const noteOf = (pair: { note: string | null }) =>
    room.kind === "december" ? null : pair.note ? <NoteText text={pair.note} /> : "No note yet";

  async function revealNext() {
    setSending(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/rooms/${room.code}/reveal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: reveal.step }),
      });
      if (!response.ok) {
        const body: ApiError = await response.json();
        setProblem(body.error.message);
      }
      // The button stays busy until the new pair is on this screen, so a second tap cannot skip a pair.
      await onMoved();
    } catch {
      setProblem("The pair was not shown. Check your connection and try again.");
    }
    setSending(false);
    setAsking(false);
  }

  function tapReveal() {
    if (reveal.step === 0 && isBeforeExchangeDate(room.exchangeDate, new Date())) setAsking(true);
    else void revealNext();
  }

  if (reveal.total === 0) return null;

  if (reveal.step === reveal.total) {
    return (
      <section className="panel panel--lit" aria-labelledby="reveal-title" ref={stage}>
        <h2 className="panel__title" id="reveal-title">
          The ring
        </h2>
        <p>Every pair is out. Each person gave to the next one, and the last one gave to the first.</p>
        <Cheers key={reveal.step} cheer={cheer} />
        <ol className="members">
          {ringOrder(reveal.pairs).map((pair) => (
            <li className="members__row" key={pair.giverName}>
              <span>{pair.giverName}</span>
              <span className="members__tag">gave to {pair.receiverName}</span>
              {noteOf(pair) && <span className="members__note">{noteOf(pair)}</span>}
            </li>
          ))}
        </ol>
        {room.kind !== "december" && (
          <div>
            <Link className="btn" href="/">
              Start your December room
            </Link>
          </div>
        )}
      </section>
    );
  }

  const controls =
    me.isOrganizer &&
    (asking ? (
      <div className="confirm">
        <p>The exchange is on {room.exchangeDate}. Reveal the pairs now? You cannot hide them again.</p>
        <div className="confirm__actions">
          <Button onClick={revealNext} loading={sending}>
            Yes, reveal now
          </Button>
          <Button variant="quiet" onClick={() => setAsking(false)}>
            Not yet
          </Button>
        </div>
      </div>
    ) : (
      <Button onClick={tapReveal} loading={sending}>
        Reveal next
      </Button>
    ));

  if (reveal.step === 0) {
    return (
      <section className="panel" aria-labelledby="reveal-title">
        <h2 className="panel__title" id="reveal-title">
          The reveal
        </h2>
        <p>
          {me.isOrganizer
            ? "Show the pairs one by one when your group is together. Every screen shows the same pair."
            : "The organizer has not started the reveal yet."}
        </p>
        {note.notesIn !== null && (
          <p>
            Gift notes in: {note.notesIn} of {reveal.total}.
          </p>
        )}
        {controls}
        {problem && <Notice tone="error">{problem}</Notice>}
      </section>
    );
  }

  const latest = reveal.pairs[reveal.pairs.length - 1];
  return (
    <section className="panel panel--lit" aria-labelledby="reveal-title" ref={stage}>
      <h2 className="panel__title" id="reveal-title">
        Pair {reveal.step} of {reveal.total}
      </h2>
      {/* The reveal motion: first the receiver, then the giver, then the note. */}
      <div className="reveal__pair" aria-live="polite">
        <p className="reveal__lead">The secret giver of {latest.receiverName} is</p>
        <p className="drawcard__name reveal__giver">{latest.giverName}</p>
      </div>
      {noteOf(latest) && (
        <p className="reveal__note reveal__later">
          {noteOf(latest)}
        </p>
      )}
      <Cheers key={reveal.step} cheer={cheer} />
      {controls}
      {problem && <Notice tone="error">{problem}</Notice>}
      {reveal.step > 1 && (
        <ul className="members" aria-label="Pairs shown before">
          {reveal.pairs.slice(0, -1).map((pair) => (
            <li className="members__row" key={pair.giverName}>
              <span>{pair.giverName}</span>
              <span className="members__tag">gives to {pair.receiverName}</span>
              {noteOf(pair) && <span className="members__note">{noteOf(pair)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
