"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { ApiError } from "@/lib/http";
import type { RoomState } from "@/lib/rooms";

type MemberListProps = { state: RoomState; /** A member was removed: load the state of the room again. */ onChanged: () => void };

/** Who is in the room. Before the draw the organizer can remove a member, with one question first. */
export function MemberList({ state, onChanged }: MemberListProps) {
  const [asking, setAsking] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { room, me, members, draw } = state;
  const canRemove = me.isOrganizer && !draw.drawn && room.kind !== "demo";

  async function remove(displayName: string) {
    setSending(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/rooms/${room.code}/members/${encodeURIComponent(displayName)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      // Status 404 means that the member is gone already, which is what the organizer wanted.
      if (!response.ok && response.status !== 404) {
        const body: ApiError = await response.json();
        setProblem(body.error.message);
      }
      onChanged();
    } catch {
      setProblem("The member was not removed. Check your connection and try again.");
    }
    setSending(false);
    setAsking(null);
  }

  return (
    <section className="panel" aria-labelledby="members-title">
      <h2 className="panel__title" id="members-title">
        In the room: {members.length}
      </h2>
      <ul className="members">
        {members.map((member) => (
          <li className="members__row" key={member.displayName}>
            <span>{member.displayName}</span>
            <span className="members__tag">
              {[member.isDemo && "demo", member.isOrganizer && "organizer", member.role === "guest" && "guest", member.displayName === me.displayName && "you"]
                .filter(Boolean)
                .join(", ")}
            </span>
            {canRemove && !member.isOrganizer && asking !== member.displayName && (
              <Button variant="quiet" aria-label={`Remove ${member.displayName}`} onClick={() => setAsking(member.displayName)}>
                Remove
              </Button>
            )}
            {canRemove && asking === member.displayName && (
              <div className="members__note confirm">
                <p>Remove {member.displayName}? This person cannot join the room again.</p>
                <div className="confirm__actions">
                  <Button variant="quiet" loading={sending} onClick={() => remove(member.displayName)}>
                    Yes, remove
                  </Button>
                  <Button variant="quiet" onClick={() => setAsking(null)}>
                    Keep
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {problem && <Notice tone="error">{problem}</Notice>}
    </section>
  );
}
