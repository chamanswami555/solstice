"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** The text names nobody: it must not tell the group who asked or who is asked. */
export const NUDGE_TEXT = "Someone has a secret question waiting";

/** Opens the phone's share sheet with the nudge and the room link. With no share sheet, it copies both. */
export function Nudge({ link }: { link: string }) {
  const [result, setResult] = useState("");

  async function nudge() {
    setResult("");
    if (navigator.share) {
      try {
        await navigator.share({ text: NUDGE_TEXT, url: link });
        return;
      } catch (error) {
        // The person closed the share sheet: nothing to say.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${NUDGE_TEXT}: ${link}`);
      setResult("Copied. Paste it in your group chat.");
    } catch {
      setResult(`Copy this by hand: ${NUDGE_TEXT}: ${link}`);
    }
  }

  return (
    <section className="panel" aria-labelledby="nudge-title">
      <h2 className="panel__title" id="nudge-title">
        Waiting for an answer?
      </h2>
      <p>Send your group a reminder. It names nobody: &ldquo;{NUDGE_TEXT}&rdquo;, with the room link.</p>
      <div>
        <Button variant="quiet" onClick={nudge}>
          Nudge the group
        </Button>
      </div>
      <p className="field__help" role="status">
        {result}
      </p>
    </section>
  );
}
