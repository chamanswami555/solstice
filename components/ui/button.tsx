"use client";

import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet";
  /** A request is in flight. The button keeps its label and its focus, and refuses a second press. */
  loading?: boolean;
};

/** A page has one primary button. Every other action is quiet. */
export function Button({
  variant = "primary",
  loading = false,
  type = "button",
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const classes = ["btn", variant === "quiet" && "btn--quiet", loading && "keep-motion", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
    >
      {children}
    </button>
  );
}
