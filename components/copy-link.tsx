"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

/** A link in a read-only box with a copy button. The box stays selectable when the copy fails. */
export function CopyLink({ label, value }: { label: string; value: string }) {
  const id = useId();
  const [result, setResult] = useState<"" | "Copied." | "Select the link and copy it by hand.">("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setResult("Copied.");
    } catch {
      setResult("Select the link and copy it by hand.");
    }
  }

  return (
    <div className="copy">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="copy__row">
        <input className="field__input copy__value" id={id} value={value} readOnly onFocus={(event) => event.target.select()} />
        <Button variant="quiet" onClick={copy}>
          Copy
        </Button>
      </div>
      <p className="field__help" role="status">
        {result}
      </p>
    </div>
  );
}
