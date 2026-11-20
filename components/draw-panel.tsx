"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { DRAW_MIN_MEMBERS } from "@/lib/draw-rules";
import type { ApiError } from "@/lib/http";
import type { RoomState } from "@/lib/rooms";

type DrawPanelProps = { state: RoomState; onDrawn: () => void };

/** Before the draw: the organizer's button. After it: the one name this person gives to. */
export function DrawPanel({ state, onDrawn }: DrawPanelProps) {
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { room, me, members, draw, reveal, wishes } = state;

  async function drawNow() {
    setSending(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/rooms/${room.code}/draw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok && response.status !== 409) {
        const body: ApiError = await response.json();
        setProblem(body.error.message);
      }
      onDrawn();
    } catch {
      setProblem("The names were not drawn. Check your connection and try again.");
    }
    setSending(false);
    setAsking(false);
  }

  if (draw.drawn) {
    return draw.receiverName ? (
      <section className={`panel drawcard${reveal.step === 0 ? " panel--lit" : ""}`} aria-labelledby="draw-title">
        <h2 className="panel__title" id="draw-title">
          You give to
        </h2>
        <p className="drawcard__name">{draw.receiverName}</p>
        {wishes.receiver && wishes.receiver.length > 0 && (
          <>
            <p>Wish list of {draw.receiverName}:</p>
            <ul className="wishlist">
              {wishes.receiver.map((wish) => (
                <li key={wish}>{wish}</li>
              ))}
            </ul>
          </>
        )}
        {wishes.receiver?.length === 0 && <p>{draw.receiverName} wrote no wishes yet.</p>}
        {reveal.step < reveal.total && <p className="panel__warn">Only you can see this. Keep it to yourself until the reveal.</p>}
      </section>
    ) : (
      <section className="panel" aria-labelledby="draw-title">
        <h2 className="panel__title" id="draw-title">
          The names are drawn
        </h2>
        <p>You joined after the draw, so you are a guest. You can watch the reveal.</p>
      </section>
    );
  }

  const drawable = members.filter((member) => member.role === "member").length;
  return (
    <section className="panel" aria-labelledby="draw-title">
      <h2 className="panel__title" id="draw-title">
        The draw
      </h2>
      {!me.isOrganizer && <p>The organizer has not drawn the names yet.</p>}
      {me.isOrganizer && drawable < DRAW_MIN_MEMBERS && (
        <p>A draw needs {DRAW_MIN_MEMBERS} or more members. Share the invite link with your group.</p>
      )}
      {me.isOrganizer && drawable === DRAW_MIN_MEMBERS && (
        <Notice>With 3 people you can work out your giver. Invite a 4th.</Notice>
      )}
      {me.isOrganizer && drawable >= DRAW_MIN_MEMBERS && !asking && (
        <>
          <p>Everyone in the room gets one person to give to. People who join after the draw are guests.</p>
          <Button onClick={() => setAsking(true)}>Draw names</Button>
        </>
      )}
      {me.isOrganizer && asking && (
        <div className="confirm">
          <p>Draw now for {drawable} members? You cannot draw again.</p>
          <div className="confirm__actions">
            <Button onClick={drawNow} loading={sending}>
              Yes, draw
            </Button>
            <Button variant="quiet" onClick={() => setAsking(false)}>
              Not yet
            </Button>
          </div>
        </div>
      )}
      {problem && <Notice tone="error">{problem}</Notice>}
    </section>
  );
}
