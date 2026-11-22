"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CopyLink } from "@/components/copy-link";
import { DemoBanner } from "@/components/demo-banner";
import { DrawPanel } from "@/components/draw-panel";
import { GiftNote } from "@/components/gift-note";
import { JoinForm } from "@/components/join-form";
import { nextStep } from "@/lib/next-step";
import { MaskThreads } from "@/components/mask-thread";
import { Nudge } from "@/components/nudge";
import { MemberList } from "@/components/member-list";
import { Reveal } from "@/components/reveal";
import { RoomTalk } from "@/components/room-talk";
import { Button } from "@/components/ui/button";
import { Wishes } from "@/components/wishes";
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

/** Also the static page before the script runs. A browser that cannot run the script stays here, so it says what to do. */
export function RoomOpening() {
  return (
    <div className="room">
      <p className="lead">Opening the room.</p>
      <p>If the room does not open in a few seconds, copy the link and open it in Chrome or Safari.</p>
    </div>
  );
}

export function Room() {
  const { code } = useParams<{ code: string }>();
  const [view, setView] = useState<View>({ status: "loading" });
  const [returnLink, setReturnLink] = useState<string | null>(null);
  // Counts the state loads. The mask threads load again with each one, by timer or by signal.
  const [loads, setLoads] = useState(0);
  // Cheers live only in this page: who cheered, for each room and reveal step. One cheer for each person.
  const [cheers, setCheers] = useState<Record<string, string[]>>({});
  const [sendCheer, setSendCheer] = useState<((step: number) => Promise<boolean>) | null>(null);
  // Typed wishes, kept with their room code: a demo that starts again gets a new code and an empty draft.
  const [wishDraft, setWishDraft] = useState<{ code: string; list: string[] } | null>(null);
  const onCheer = useCallback((roomCode: string, senderId: string, step: number) => {
    const key = `${roomCode}:${step}`;
    setCheers((shown) => (shown[key]?.includes(senderId) ? shown : { ...shown, [key]: [...(shown[key] ?? []), senderId] }));
  }, []);
  const onCheerReady = useCallback((cheer: ((step: number) => Promise<boolean>) | null) => setSendCheer(() => cheer), []);

  const reload = useCallback(async () => {
    try {
      setView(await loadState(code));
      setLoads((count) => count + 1);
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

  if (view.status === "loading") return <RoomOpening />;
  if (view.status === "failed") {
    return <Notice tone="error">The room did not load. Check your connection. The page tries again every 10 seconds.</Notice>;
  }
  if (view.status === "missing") {
    return (
      <div className="room">
        <h1 className="room__title">This room does not exist</h1>
        <p className="lead">Check the invite link, or ask your organizer for a new one.</p>
        <div>
          <Link className="btn" href="/">
            Start a new room
          </Link>
        </div>
      </div>
    );
  }
  if (view.status === "outside") {
    return (
      <div className="room">
        <div className="room__head">
          <h1 className="room__title">{view.roomName}</h1>
          <p className="room__meta">You are invited to a Secret Santa. Join with your name. After the draw you get one person to give a gift to.</p>
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

  const { room, me, members, draw, reveal } = view.state;
  // Before the first pair the draw card leads. From the first pair on, the reveal leads.
  const cheeredBy = cheers[`${room.code}:${reveal.step}`] ?? [];
  const nameOf = new Map(members.map((member) => [member.talkId, member.displayName]));
  const cheer = {
    send: sendCheer && (() => sendCheer(reveal.step)),
    mine: cheeredBy.includes(me.talkId),
    // The caller last, as "you". A sender who is not in the member list is not shown.
    names: [...cheeredBy.filter((id) => id !== me.talkId).flatMap((id) => nameOf.get(id) ?? []), ...(cheeredBy.includes(me.talkId) ? ["you"] : [])],
  };
  const revealPanel = <Reveal state={view.state} onMoved={reload} cheer={cheer} />;
  const inviteLink = `${window.location.origin}/r/${room.code}`;
  const returnPanel = returnLink && (
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
  );
  const invitePanel = room.kind !== "demo" && (
    <section className="panel" aria-labelledby="invite-title">
      <h2 className="panel__title" id="invite-title">
        Invite your group
      </h2>
      <CopyLink label="Invite link" value={inviteLink} />
    </section>
  );
  const wishesPanel = (
    <Wishes
      state={view.state}
      draft={wishDraft?.code === room.code ? wishDraft.list : null}
      onDraft={(list) => setWishDraft({ code: room.code, list })}
    />
  );
  const memberList = <MemberList state={view.state} onChanged={() => void reload()} />;
  // After the draw these matter less than the draw card and the talks, so they fold away at the end.
  const folded = [me.role === "member" && "your wish list", "the people", room.kind !== "demo" && "the invite link"].filter(
    (part): part is string => Boolean(part),
  );
  // The key gives a new room its own fresh panels: a demo that starts again must not keep typed drafts.
  return (
    <div className="room" key={room.code}>
      <div className="room__head">
        <h1 className="room__title">{room.name}</h1>
        <p className="room__meta">
          {room.kind === "december" ? `December room, exchange on ${room.exchangeDate}` : room.kind === "demo" ? "Demo room for one visitor" : "Tonight round"}
          {room.budget ? `, budget ${room.budget}` : ""}
        </p>
      </div>
      <p className="nextstep" role="status">
        {nextStep(view.state)}
      </p>

      {room.kind === "demo" && <DemoBanner demoNames={members.filter((member) => member.isDemo).map((member) => member.displayName)} />}

      {!draw.drawn && invitePanel}
      {room.kind !== "demo" && returnPanel}

      {reveal.step > 0 && revealPanel}
      <DrawPanel state={view.state} onDrawn={() => void reload()} />
      {reveal.step === 0 && me.isOrganizer && revealPanel}
      {draw.drawn && me.role === "member" && <MaskThreads code={room.code} refresh={loads} revealed={reveal.step === reveal.total} />}
      <GiftNote state={view.state} onSaved={() => void reload()} />
      {draw.drawn && me.role === "member" && room.kind !== "demo" && reveal.step < reveal.total && <Nudge link={inviteLink} />}
      {reveal.step === 0 && !me.isOrganizer && revealPanel}
      {!draw.drawn && wishesPanel}
      {!draw.drawn && memberList}
      <RoomTalk code={room.code} me={me} members={members} onSignal={reload} onCheer={onCheer} onCheerReady={onCheerReady} />
      {room.kind === "demo" && returnPanel}

      {draw.drawn && (
        <details className="fold">
          <summary className="fold__summary">Show {new Intl.ListFormat("en", { type: "conjunction" }).format(folded)}</summary>
          <div className="fold__body">
            {wishesPanel}
            {invitePanel}
            {memberList}
          </div>
        </details>
      )}
    </div>
  );
}
