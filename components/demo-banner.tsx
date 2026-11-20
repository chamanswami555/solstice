import Link from "next/link";
import { DemoStart } from "@/components/demo-start";

/** The top of a demo room: what is real here and what the website plays. */
export function DemoBanner({ demoNames }: { demoNames: string[] }) {
  return (
    <section className="panel" aria-labelledby="demo-title">
      <h2 className="panel__title" id="demo-title">
        This is a demo room
      </h2>
      <p>
        {new Intl.ListFormat("en", { type: "conjunction" }).format(demoNames)} are demo members: the website plays their parts. Draw the names, ask a question in a secret talk, write
        a gift note, then reveal the pairs. It takes about 3 minutes.
      </p>
      <div className="confirm__actions">
        <DemoStart label="Start the demo again" />
        <Link className="btn btn--quiet" href="/">
          Create a room for your group
        </Link>
      </div>
    </section>
  );
}
