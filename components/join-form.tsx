"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ApiError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";

type JoinFormProps = {
  code: string;
  /** Called after the server added this person. The secret is set only for a new identity. */
  onJoined: (returnSecret: string | null) => void;
};

export function JoinForm({ code, onJoined }: JoinFormProps) {
  const [nameError, setNameError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const displayName = String(new FormData(form).get("displayName") ?? "").trim();
    if (displayName === "") {
      setNameError("Enter the name your group knows you by.");
      (form.elements.namedItem("displayName") as HTMLInputElement | null)?.focus();
      return;
    }

    setNameError(undefined);
    setNotice(null);
    setSending(true);
    try {
      const response = await fetch(`/api/rooms/${code}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (response.status === 201) {
        const joined: { returnSecret: string | null } = await response.json();
        onJoined(joined.returnSecret);
        return;
      }
      const problem: ApiError = await response.json();
      setNameError(problem.error.fields?.displayName);
      setNotice(problem.error.fields ? null : problem.error.message);
    } catch {
      setNotice("You did not join. Check your connection and try again.");
    }
    setSending(false);
  }

  return (
    <form className="form" aria-label="Join the room" noValidate onSubmit={handleSubmit}>
      <Field
        label="Your display name"
        name="displayName"
        placeholder="Rohan"
        hint="Your group sees you by this name."
        maxLength={LIMITS.displayNameMax}
        autoComplete="nickname"
        required
        error={nameError}
      />
      <Button type="submit" loading={sending}>
        Join room
      </Button>
      {notice && <Notice tone="error">{notice}</Notice>}
    </form>
  );
}
