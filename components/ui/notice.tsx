import type { ReactNode } from "react";

type NoticeProps = {
  /** "info" tells the reader a fact. "error" tells the reader that an action failed. */
  tone?: "info" | "error";
  children: ReactNode;
};

/** A short message in the flow of the page. A screen reader reads it when it appears. */
export function Notice({ tone = "info", children }: NoticeProps) {
  const isError = tone === "error";

  return (
    <div className={isError ? "notice notice--error" : "notice"} role={isError ? "alert" : "status"}>
      {children}
    </div>
  );
}
