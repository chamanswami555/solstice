/** The browser side of room talk. The Chat SDK is loaded only when a room opens its talk. */
import type { NexconnRegion } from "@/lib/config";
import type { TalkAccess } from "@/lib/room-talk";
import { CHEER_TYPE, parseCheerStep, SIGNAL_TYPE } from "@/lib/talk-rules";

export type TalkMessage = { id: string; senderId: string; text: string; sentAt: number };
export type RoomTalk = {
  /** Sends one text message. False when the chat service refused it. */
  send(text: string): Promise<boolean>;
  /** Sends a cheer for one reveal step. False when the chat service refused it. */
  cheer(step: number): Promise<boolean>;
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
 * the caller keeps one message for each id. `onSignal` runs for each signal of this room: the
 * caller loads the state from our server and trusts nothing in the signal itself. `onCheer` runs for
 * each cheer, the caller's own too: the sender comes from the chat service, the step is checked.
 */
export async function connectRoomTalk(
  access: TalkAccess,
  onMessages: (messages: TalkMessage[]) => void,
  onSignal: () => void,
  onCheer: (senderId: string, step: number) => void,
): Promise<RoomTalk> {
  const { NCEngine, MessageHandler, BaseChannel, GroupChannel, GroupChannelIdentifier, SendMessageParams, SendTextMessageParams } = await import("@nexconn/chat");
  if (!initialized) {
    NCEngine.initialize({ appKey: access.appKey, areaCode: AREA[access.region] });
    NCEngine.registerCustomMessages([
      { messageType: SIGNAL_TYPE, isPersisted: false, isCounted: false },
      { messageType: CHEER_TYPE, isPersisted: false, isCounted: false },
    ]);
    initialized = true;
  }

  type SdkMessage = { messageId: string; messageType: string; senderUserId: string; sentTime: number; content: { text?: unknown; step?: unknown }; channelIdentifier: { channelId: string } };
  const ofThisRoom = (messages: SdkMessage[]): TalkMessage[] =>
    messages
      .filter((message) => message.messageType === TEXT_MESSAGE && message.channelIdentifier.channelId === access.channelId)
      .map((message) => ({ id: message.messageId, senderId: message.senderUserId, text: String(message.content.text ?? ""), sentAt: message.sentTime }));

  const cheersIn = (messages: SdkMessage[]) => {
    for (const message of messages) {
      const step = message.messageType === CHEER_TYPE && message.channelIdentifier.channelId === access.channelId ? parseCheerStep(message.content) : null;
      if (step !== null) onCheer(message.senderUserId, step);
    }
  };
  const received = (messages: SdkMessage[]) => {
    if (messages.some((message) => message.messageType === SIGNAL_TYPE && message.channelIdentifier.channelId === access.channelId)) onSignal();
    cheersIn(messages);
    const talk = ofThisRoom(messages);
    if (talk.length > 0) onMessages(talk);
  };
  NCEngine.addMessageHandler(HANDLER, new MessageHandler({ onMessageReceived: ({ messages }) => received(messages) }));
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
    async cheer(step) {
      const params = new SendMessageParams({ step }, CHEER_TYPE);
      params.disableNotification = true;
      const sent = await channel.sendMessage(params);
      if (sent.isOk && sent.data) cheersIn([sent.data as unknown as SdkMessage]);
      return sent.isOk;
    },
    close() {
      NCEngine.removeMessageHandler(HANDLER);
      void NCEngine.disconnect();
    },
  };
}
