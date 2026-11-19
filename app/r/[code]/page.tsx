import { Suspense } from "react";
import { Room } from "@/components/room";

/** The page is a static shell. The room loads in the browser, for the person of the cookie. */
export default function RoomPage() {
  return (
    <Suspense fallback={<p className="lead">Opening the room.</p>}>
      <Room />
    </Suspense>
  );
}
