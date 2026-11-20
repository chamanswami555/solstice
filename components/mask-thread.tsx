"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { ApiError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import type { MaskSide, MaskThread, MaskThreads as Threads } from "@/lib/mask";

type MaskThreadsProps = { code: string; /** Changes when the room loaded its state again: load the threads again too. */ refresh: number; revealed: boolean };

const JSON_HEADERS = { "content-type": "application/json" };

/** The two secret threads of a member: one with the person they give to, one with their own secret giver. */
export function MaskThreads({ code, refresh, revealed }: MaskThreadsProps) {
  const [threads, setThreads] = useState<Threads | null>(null);

  useEffect(() => {
    let stopped = false;
    fetch(`/api/rooms/${code}/mask`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { threads: Threads } | null) => {
        if (body && !stopped) setThreads(body.threads);
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [code, refresh]);

  if (!threads) return null;
  const update = (thread: MaskThread) => setThreads((shown) => (shown ? { ...shown, [thread.side]: thread } : shown));
  return (
    <>
      {threads.giving && <ThreadPanel code={code} thread={threads.giving} revealed={revealed} onChange={update} />}
      {threads.receiving && <ThreadPanel code={code} thread={threads.receiving} revealed={revealed} onChange={update} />}
    </>
  );
}

type ThreadPanelProps = { code: string; thread: MaskThread; revealed: boolean; onChange: (thread: MaskThread) => void };

function ThreadPanel({ code, thread, revealed, onChange }: ThreadPanelProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "mute">("");
  const [problem, setProblem] = useState<string | null>(null);
  const list = useRef<HTMLOListElement | null>(null);
  const other = thread.withName ?? "your secret giver";
  const otherLabel = thread.withName ?? "Your secret giver";

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [thread.messages.length]);

  /** Sends one request for this thread and shows the thread that the server answers with. */
  async function change(action: "send" | "mute", path: string, method: "POST" | "PUT", body: { side: MaskSide; text?: string; muted?: boolean }): Promise<boolean> {
    setBusy(action);
    setProblem(null);
    try {
      const response = await fetch(`/api/rooms/${code}/${path}`, { method, headers: JSON_HEADERS, body: JSON.stringify(body) });
      const answer: { thread: MaskThread } | ApiError = await response.json();
      if ("thread" in answer) onChange(answer.thread);
      else setProblem(answer.error.message);
      return response.ok;
    } catch {
      setProblem("That did not go through. Check your connection and try again.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    if (await change("send", "mask", "POST", { side: thread.side, text })) setText("");
  }

  const setMuted = (muted: boolean) => change("mute", "mask/mute", "PUT", { side: thread.side, muted });

  return (
    <section className="panel" aria-labelledby={`${id}-title`}>
      <h2 className="panel__title" id={`${id}-title`}>
        Your talk with {other}
      </h2>
      <p className="panel__warn">
        {thread.side === "giving"
          ? revealed
            ? `You were the secret giver of ${other}.`
            : `${other} sees you as "Your secret giver". Your name is shown at the reveal.`
          : thread.withName
            ? `${other} was your secret giver.`
            : "Only the two of you see this talk. You see the name at the end of the reveal."}
      </p>
      <ol className="talk" ref={list} role="log" aria-label={`Messages with ${other}`} tabIndex={0}>
        {thread.messages.length === 0 && <li className="talk__name">No messages yet.</li>}
        {thread.messages.map((message) => (
          <li className="talk__row" key={message.id}>
            <span className="talk__name">{message.mine ? "You" : otherLabel}</span>
            <span className="talk__text">{message.body}</span>
          </li>
        ))}
      </ol>
      {thread.muted ? (
        <>
          <Notice>This thread is muted.{thread.mutedByMe ? "" : " The other person muted it."}</Notice>
          {thread.mutedByMe && (
            <div>
              <Button variant="quiet" loading={busy === "mute"} onClick={() => setMuted(false)}>
                Open this thread again
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <form className="copy" onSubmit={send}>
            <label className="field__label" htmlFor={`${id}-text`}>
              Message to {other}
            </label>
            <div className="copy__row">
              <input
                className="field__input"
                id={`${id}-text`}
                value={text}
                maxLength={LIMITS.maskTextMax}
                autoComplete="off"
                onChange={(event) => setText(event.target.value)}
              />
              <Button type="submit" variant="quiet" loading={busy === "send"}>
                Send
              </Button>
            </div>
          </form>
          <div>
            <Button variant="quiet" loading={busy === "mute"} onClick={() => setMuted(true)}>
              Mute this thread
            </Button>
          </div>
        </>
      )}
      {problem && <Notice tone="error">{problem}</Notice>}
    </section>
  );
}
