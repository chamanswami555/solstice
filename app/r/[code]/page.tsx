import { Suspense } from "react";
import { Room, RoomOpening } from "@/components/room";

/** The page is a static shell. The room loads in the browser, for the person of the cookie. */
export default function RoomPage() {
  return (
    <Suspense fallback={<RoomOpening />}>
      <Room />
    </Suspense>
  );
}
