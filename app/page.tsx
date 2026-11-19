import { CreateRoomForm } from "@/components/create-room-form";

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
    </div>
  );
}
