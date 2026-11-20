"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CopyLink } from "@/components/copy-link";
import { DrawPanel } from "@/components/draw-panel";
import { JoinForm } from "@/components/join-form";
import { Reveal } from "@/components/reveal";
import { RoomTalk } from "@/components/room-talk";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { RoomState } from "@/lib/rooms";

const RELOAD_MS = 10_000;

type View =
  | { status: "loading" }
  | { status: "ready"; state: RoomState }
  | { status: "outside"; roomName: string }
  | { status: "missing" }
  | { status: "failed" };

/** A member gets the room. A person outside gets the name of the room, to join it. */
async function loadState(code: string): Promise<View> {
  const response = await fetch(`/api/rooms/${code}/state`, { cache: "no-store" });
  if (response.ok) return { status: "ready", state: await response.json() };
  if (response.status !== 401 && response.status !== 404) return { status: "failed" };

  const door = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
  if (door.ok) return { status: "outside", roomName: (await door.json()).room.name };
  return { status: door.status === 404 ? "missing" : "failed" };
}

/** Takes the return secret out of the address bar, so a shared address never carries it. */
function takeReturnSecret(): string | null {
  const secret = new URLSearchParams(window.location.hash.slice(1)).get("k");
  if (secret) window.history.replaceState(null, "", window.location.pathname);
  return secret;
}

async function openReturnLink(secret: string): Promise<boolean> {
  const response = await fetch("/api/identity/return", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecret: secret }),
  });
  return response.ok;
}

export function Room() {
  const { code } = useParams<{ code: string }>();
  const [view, setView] = useState<View>({ status: "loading" });
  const [returnLink, setReturnLink] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setView(await loadState(code));
    } catch {
      setView((shown) => (shown.status === "ready" ? shown : { status: "failed" }));
    }
  }, [code]);

  useEffect(() => {
    let stopped = false;
    async function open() {
      const secret = takeReturnSecret();
      let loaded = await loadState(code).catch((): View => ({ status: "failed" }));
      // A person who arrives with the cookie has just made this identity: show the link to save.
      const isNewIdentity = secret !== null && loaded.status === "ready";
      if (secret && loaded.status === "outside" && (await openReturnLink(secret).catch(() => false))) {
        loaded = await loadState(code).catch((): View => ({ status: "failed" }));
      }
      if (stopped) return;
      setView(loaded);
      if (isNewIdentity) setReturnLink(`${window.location.origin}/r/${code}#k=${secret}`);
    }
    void open();
    // Signals are an extra. The room also loads its state on a timer, so a lost signal costs seconds.
    const timer = window.setInterval(() => void reload(), RELOAD_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [code, reload]);

  if (view.status === "loading") return <p className="lead">Opening the room.</p>;
  if (view.status === "failed") {
    return <Notice tone="error">The room did not load. Check your connection. The page tries again every 10 seconds.</Notice>;
  }
  if (view.status === "missing") {
    return (
      <div className="room">
        <h1 className="room__title">This room does not exist</h1>
        <p className="lead">Check the invite link, or ask your organizer for a new one.</p>
      </div>
    );
  }
  if (view.status === "outside") {
    return (
      <div className="room">
        <div className="room__head">
          <h1 className="room__title">{view.roomName}</h1>
          <p className="room__meta">You are invited to this secret gift exchange.</p>
        </div>
        <JoinForm
          code={code}
          onJoined={(secret) => {
            if (secret) setReturnLink(`${window.location.origin}/r/${code}#k=${secret}`);
            void reload();
          }}
        />
      </div>
    );
  }

  const { room, me, members, reveal } = view.state;
  // Before the first pair the draw card leads. From the first pair on, the reveal leads.
  const revealPanel = <Reveal state={view.state} onMoved={reload} />;
  const inviteLink = `${window.location.origin}/r/${room.code}`;
  return (
    <div className="room">
      <div className="room__head">
        <h1 className="room__title">{room.name}</h1>
        <p className="room__meta">
          {room.kind === "tonight" ? "Tonight round" : `December room, exchange on ${room.exchangeDate}`}
          {room.budget ? `, budget ${room.budget}` : ""}
        </p>
      </div>

      {returnLink && (
        <section className="panel panel--lit" aria-labelledby="return-title">
          <h2 className="panel__title" id="return-title">
            Save your return link
          </h2>
          <p>This link opens your place in the room on another phone or after you clear your browser. It is shown one time.</p>
          <CopyLink label="Your return link" value={returnLink} />
          <p className="panel__warn">Keep it to yourself. Anyone with this link is you in this room.</p>
          <div>
            <Button variant="quiet" onClick={() => setReturnLink(null)}>
              I saved it
            </Button>
          </div>
        </section>
      )}

      {reveal.step > 0 && revealPanel}
      <DrawPanel state={view.state} onDrawn={() => void reload()} />
      {reveal.step === 0 && revealPanel}
      <RoomTalk code={room.code} me={me} members={members} />

      <section className="panel" aria-labelledby="invite-title">
        <h2 className="panel__title" id="invite-title">
          Invite your group
        </h2>
        <CopyLink label="Invite link" value={inviteLink} />
      </section>

      <section className="panel" aria-labelledby="members-title">
        <h2 className="panel__title" id="members-title">
          In the room: {members.length}
        </h2>
        <ul className="members">
          {members.map((member) => (
            <li className="members__row" key={member.displayName}>
              <span>{member.displayName}</span>
              <span className="members__tag">
                {[member.isOrganizer && "organizer", member.role === "guest" && "guest", member.displayName === me.displayName && "you"]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
