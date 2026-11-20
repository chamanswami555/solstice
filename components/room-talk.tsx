"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { LIMITS } from "@/lib/limits";
import { connectRoomTalk, type RoomTalk as Connection, type TalkMessage } from "@/lib/nexconn-client";
import type { RoomMember } from "@/lib/rooms";

type RoomTalkProps = { code: string; me: RoomMember; members: RoomMember[]; /** A signal came in: load the state of the room again. */ onSignal: () => void };

/** One message for each id, oldest first. */
function merged(shown: TalkMessage[], incoming: TalkMessage[]): TalkMessage[] {
  const byId = new Map([...shown, ...incoming].map((message) => [message.id, message]));
  return [...byId.values()].sort((a, b) => a.sentAt - b.sentAt);
}

/** The talk of the whole room. The room works without it: the draw and the reveal need no chat. */
export function RoomTalk({ code, me, members, onSignal }: RoomTalkProps) {
  const inputId = useId();
  const [status, setStatus] = useState<"connecting" | "ready" | "off">("connecting");
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const connection = useRef<Connection | null>(null);
  const list = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    let closed = false;
    async function open() {
      try {
        const response = await fetch(`/api/rooms/${code}/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        if (!response.ok) throw new Error(`token route answered ${response.status}`);
        const { talk } = await response.json();
        const opened = await connectRoomTalk(talk, (incoming) => setMessages((shown) => merged(shown, incoming)), onSignal);
        if (closed) return opened.close();
        connection.current = opened;
        setStatus("ready");
      } catch {
        if (!closed) setStatus("off");
      }
    }
    void open();
    return () => {
      closed = true;
      connection.current?.close();
      connection.current = null;
    };
  }, [code, onSignal]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const words = text.trim();
    if (!words || !connection.current) return;
    setSending(true);
    setProblem(null);
    const sent = await connection.current.send(words).catch(() => false);
    if (sent) setText("");
    else setProblem("The message was not sent. Check your connection and try again.");
    setSending(false);
  }

  const nameOf = new Map(members.map((member) => [member.talkId, member.displayName]));
  return (
    <section className="panel" aria-labelledby="talk-title">
      <h2 className="panel__title" id="talk-title">
        Room talk
      </h2>
      {status === "connecting" && <p className="panel__warn">Connecting to room talk.</p>}
      {status === "off" && <Notice>Room talk is not available now. The draw and the reveal work without it.</Notice>}
      {status === "ready" && (
        <>
          <ol className="talk" ref={list} role="log" aria-label="Messages" tabIndex={0}>
            {messages.length === 0 && <li className="talk__name">No messages yet. Say hello to your group.</li>}
            {messages.map((message) => (
              <li className="talk__row" key={message.id}>
                <span className="talk__name">
                  {message.senderId === me.talkId ? "You" : (nameOf.get(message.senderId) ?? "Someone who left")}
                </span>
                <span className="talk__text">{message.text}</span>
              </li>
            ))}
          </ol>
          <form className="copy" onSubmit={send}>
            <label className="field__label" htmlFor={inputId}>
              Message to the room
            </label>
            <div className="copy__row">
              <input
                className="field__input"
                id={inputId}
                value={text}
                maxLength={LIMITS.talkTextMax}
                autoComplete="off"
                onChange={(event) => setText(event.target.value)}
              />
              <Button type="submit" variant="quiet" loading={sending}>
                Send
              </Button>
            </div>
          </form>
          {problem && <Notice tone="error">{problem}</Notice>}
        </>
      )}
    </section>
  );
}
