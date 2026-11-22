import { CreateRoomForm } from "@/components/create-room-form";
import { DemoStart } from "@/components/demo-start";

export default function Home() {
  return (
    <div className="start">
      <div className="start__head">
        <h1 className="start__title">
          <span>Draw names.</span> <span>Ask questions.</span> <span>Keep the secret.</span>
        </h1>
        <p className="lead">Your group shares one room from one link, with no accounts.</p>
        <p className="notice">Got an invite link? Open it to join that room. This form makes a new room.</p>
        <figure className="preview">
          <div className="preview__stage">
            <p className="preview__lead">The secret giver of Rohan is</p>
            <p className="preview__giver">Meera</p>
          </div>
          <figcaption className="preview__caption">An example of the reveal. Every phone shows the same pair, live.</figcaption>
        </figure>
      </div>
      <CreateRoomForm />
      <section className="panel" aria-labelledby="demo-start-title">
        <h2 className="panel__title" id="demo-start-title">
          Alone right now?
        </h2>
        <p>See the draw, a secret talk and the reveal in a demo room. The website plays three members. It takes about 3 minutes.</p>
        <DemoStart label="Try the demo room" />
      </section>
    </div>
  );
}
