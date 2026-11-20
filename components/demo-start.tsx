"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/** Starts the visitor's demo room, or starts it again, and opens it. */
export function DemoStart({ label }: { label: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function start() {
    setSending(true);
    setProblem(null);
    try {
      const response = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      router.push(`/r/${body.room.code}${body.returnSecret ? `#k=${body.returnSecret}` : ""}`);
    } catch (error) {
      setProblem(error instanceof Error && error.message ? error.message : "The demo room did not start. Check your connection and try again.");
      setSending(false);
    }
  }

  return (
    <>
      <div>
        <Button variant="quiet" loading={sending} onClick={start}>
          {label}
        </Button>
      </div>
      {problem && <Notice tone="error">{problem}</Notice>}
    </>
  );
}
