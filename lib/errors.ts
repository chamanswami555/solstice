/** A refusal that the caller can act on. The route turns the code into a status and shows the message. */
export type RoomErrorCode = "ROOM_NOT_FOUND" | "ROOM_FULL" | "NAME_TAKEN" | "IDENTITY_CAP";

export class RoomError extends Error {
  constructor(
    public readonly code: RoomErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RoomError";
  }
}
