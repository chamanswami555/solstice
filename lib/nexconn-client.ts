/** The browser side of room talk. The Chat SDK is loaded only when a room opens its talk. */
import type { NexconnRegion } from "@/lib/config";
import type { TalkAccess } from "@/lib/room-talk";

export type TalkMessage = { id: string; senderId: string; text: string; sentAt: number };
export type RoomTalk = {
  /** Sends one text message. False when the chat service refused it. */
  send(text: string): Promise<boolean>;
  close(): void;
};

const TEXT_MESSAGE = "RC:TxtMsg";
const HANDLER = "room-talk";
const HISTORY_SIZE = 30;
const AREA: Record<NexconnRegion, 2 | 3 | 5> = { sg: 2, na: 3, sau: 5 };

// The SDK allows one initialize call for each page load.
let initialized = false;

/**
 * Connects this browser to the talk of one room. `onMessages` gets the history first and then each
 * new message. A message can come two times (the service sends recent ones again at connect), so
 * the caller keeps one message for each id.
 */
export async function connectRoomTalk(access: TalkAccess, onMessages: (messages: TalkMessage[]) => void): Promise<RoomTalk> {
  const { NCEngine, MessageHandler, BaseChannel, GroupChannel, GroupChannelIdentifier, SendTextMessageParams } = await import("@nexconn/chat");
  if (!initialized) {
    NCEngine.initialize({ appKey: access.appKey, areaCode: AREA[access.region] });
    initialized = true;
  }

  type SdkMessage = { messageId: string; messageType: string; senderUserId: string; sentTime: number; content: { text?: unknown }; channelIdentifier: { channelId: string } };
  const ofThisRoom = (messages: SdkMessage[]): TalkMessage[] =>
    messages
      .filter((message) => message.messageType === TEXT_MESSAGE && message.channelIdentifier.channelId === access.channelId)
      .map((message) => ({ id: message.messageId, senderId: message.senderUserId, text: String(message.content.text ?? ""), sentAt: message.sentTime }));

  NCEngine.addMessageHandler(HANDLER, new MessageHandler({ onMessageReceived: ({ messages }) => onMessages(ofThisRoom(messages)) }));
  const connected = await NCEngine.connect({ token: access.token });
  if (!connected.isOk) {
    NCEngine.removeMessageHandler(HANDLER);
    throw new Error(`The chat service refused the connection: code ${connected.code}.`);
  }

  const history = await BaseChannel.createMessagesQuery({
    channelIdentifier: new GroupChannelIdentifier(access.channelId),
    pageSize: HISTORY_SIZE,
  }).loadNextPage();
  if (history.isOk && history.data) onMessages(ofThisRoom(history.data.data));

  const channel = new GroupChannel(access.channelId);
  return {
    async send(text) {
      const sent = await channel.sendMessage(new SendTextMessageParams({ text }));
      if (sent.isOk && sent.data) onMessages(ofThisRoom([sent.data]));
      return sent.isOk;
    },
    close() {
      NCEngine.removeMessageHandler(HANDLER);
      void NCEngine.disconnect();
    },
  };
}
