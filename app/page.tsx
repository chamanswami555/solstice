import { CreateRoomForm } from "@/components/create-room-form";
import { DemoStart } from "@/components/demo-start";

export default function Home() {
  return (
    <div className="start">
      <div className="start__head">
        <h1 className="start__title">
          <span>Draw names.</span> <span>Ask questions.</span> <span>Keep the secret.</span>
        </h1>
        <p className="lead">A Secret Santa for your group. Everyone gets one person to give a gift to, and can ask them questions without showing their name.</p>
        <ol className="steps" aria-label="How it works">
          <li>Make a room and share one link. Nobody makes an account.</li>
          <li>The website draws the names. Ask your person anything as &quot;Your secret giver&quot;.</li>
          <li>Reveal together: every phone shows who gave to whom.</li>
        </ol>
        <div className="form__actions">
          <a className="btn" href="#create">
            Start a room
          </a>
          <DemoStart label="Try the 3-minute demo" />
        </div>
        <figure className="preview">
          <div className="preview__stage">
            <p className="preview__lead">The secret giver of Rohan is</p>
            <p className="preview__giver">Meera</p>
          </div>
          <figcaption className="preview__caption">An example of the reveal. Every phone shows the same pair, live.</figcaption>
        </figure>
      </div>
      <div className="start__form" id="create">
        <h2 className="panel__title">Start a Secret Santa for your group</h2>
        <p className="notice">Got an invite link? Open it to join that room. This form makes a new room.</p>
        <CreateRoomForm />
      </div>
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
