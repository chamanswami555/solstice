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
