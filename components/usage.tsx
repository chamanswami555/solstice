"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/ui/notice";
import type { Usage as Numbers, UsageRow } from "@/lib/usage";

const ROWS: readonly { key: "tonight" | "december"; label: string }[] = [
  { key: "tonight", label: "Tonight rounds" },
  { key: "december", label: "December rooms" },
];

function Row({ label, row }: { label: string; row: UsageRow }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{row.rooms}</td>
      <td>{row.people}</td>
      <td>{row.draws}</td>
      <td>{row.reveals}</td>
    </tr>
  );
}

/** The public numbers of the website, loaded from the server when the page opens. */
export function Usage() {
  const [numbers, setNumbers] = useState<Numbers | "failed" | null>(null);

  useEffect(() => {
    let stopped = false;
    fetch("/api/usage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("no numbers"))))
      .then((body: { usage: Numbers }) => {
        if (!stopped) setNumbers(body.usage);
      })
      .catch(() => {
        if (!stopped) setNumbers("failed");
      });
    return () => {
      stopped = true;
    };
  }, []);

  if (numbers === null) return <p className="lead">Counting.</p>;
  if (numbers === "failed") return <Notice tone="error">The numbers did not load. Check your connection and open the page again.</Notice>;

  const groups = numbers.tonight.draws + numbers.december.draws;
  return (
    <>
      <section className="panel panel--lit" aria-labelledby="usage-headline">
        <h2 className="panel__title" id="usage-headline">
          Groups that drew names
        </h2>
        <p className="drawcard__name">{groups}</p>
        <p className="panel__warn">Real rooms only. Demo rooms are counted apart, below.</p>
      </section>

      <section className="panel" aria-labelledby="usage-real">
        <h2 className="panel__title" id="usage-real">
          Real rooms
        </h2>
        <table className="usage">
          <thead>
            <tr>
              <th scope="col">Kind of room</th>
              <th scope="col">Rooms</th>
              <th scope="col">People</th>
              <th scope="col">Draws</th>
              <th scope="col">Reveals</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, label }) => (
              <Row key={key} label={label} row={numbers[key]} />
            ))}
          </tbody>
        </table>
        <p className="panel__warn">A reveal counts when every pair of the room is shown. People in all rooms together: {numbers.people}.</p>
      </section>

      <section className="panel" aria-labelledby="usage-demo">
        <h2 className="panel__title" id="usage-demo">
          Demo rooms
        </h2>
        <table className="usage">
          <thead>
            <tr>
              <th scope="col">Kind of room</th>
              <th scope="col">Rooms</th>
              <th scope="col">People</th>
              <th scope="col">Draws</th>
              <th scope="col">Reveals</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Demo rooms" row={numbers.demo} />
          </tbody>
        </table>
        <p className="panel__warn">One visitor for each demo room. The three demo members are no people and are not counted.</p>
      </section>
    </>
  );
}
