/**
 * Criterion 2 of the spec: before the reveal, nothing that reaches a browser links a giver to a pair,
 * except the one fact that each person owns: the name they give to.
 * The test records every answer of the server on four screens and reads each one.
 */
import { expect, test, type Page } from "@playwright/test";
import { createRoom, drawNames, join, roomApi, SLOW } from "./room-steps";

type Answer = { url: string; body: string };

const NAMES = ["Anita", "Rohan", "Meera", "Kabir"];

/** Keeps the body of every answer of our server that this page gets from now on. */
function record(page: Page): Answer[] {
  const answers: Answer[] = [];
  page.on("response", (response) => {
    if (!response.url().includes("/api/")) return;
    void response.text().then(
      (body) => answers.push({ url: response.url(), body }),
      () => {},
    );
  });
  return answers;
}

test("before the reveal no answer and no page links a giver to a pair", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const answers: Record<string, Answer[]> = { Anita: record(page) };
  const pages: Record<string, Page> = { Anita: page };
  const invite = await createRoom(page, "Office exchange 2026", "Anita");
  for (const name of NAMES.slice(1)) {
    pages[name] = await join(browser, invite, name);
    answers[name] = record(pages[name]);
  }
  for (const name of NAMES) {
    const saved = await pages[name].request.put(roomApi(pages[name], "wishes"), { data: { wishes: [`Wish of ${name}`] } });
    expect(saved.status()).toBe(200);
  }
  await drawNames(page, 4);

  // The truth of this run, read from each person's own draw card.
  const receiverOf: Record<string, string> = {};
  const giverOf: Record<string, string> = {};
  for (const name of NAMES) {
    receiverOf[name] = (await pages[name].locator(".drawcard .drawcard__name").textContent(SLOW))!;
    giverOf[receiverOf[name]] = name;
  }
  const talkIds: string[] = (await (await page.request.get(roomApi(page, "state"))).json()).members.map((member: { talkId: string }) => member.talkId);

  // Every giver asks a question and every receiver answers. The texts name nobody.
  for (const [index, name] of NAMES.entries()) {
    await pages[name].getByLabel(`Message to ${receiverOf[name]}`).fill(`Question ${index}`);
    await pages[name].getByLabel(`Message to ${receiverOf[name]}`).press("Enter");
  }
  for (const [index, name] of NAMES.entries()) {
    const receiver = pages[receiverOf[name]];
    await expect(receiver.getByRole("log", { name: "Messages with your secret giver" }).getByText(`Question ${index}`)).toBeVisible(SLOW);
    await receiver.getByLabel("Message to your secret giver").fill(`Answer ${index}`);
    await receiver.getByLabel("Message to your secret giver").press("Enter");
  }
  for (const [index, name] of NAMES.entries()) {
    await expect(pages[name].getByRole("log", { name: `Messages with ${receiverOf[name]}` }).getByText(`Answer ${index}`)).toBeVisible(SLOW);
  }

  for (const [index, name] of NAMES.entries()) {
    const mine = answers[name];
    const receiver = receiverOf[name];
    // The two threads of this person: the question they asked, and the question their own giver asked.
    const ownThreads = [index, NAMES.indexOf(giverOf[name])];
    const foreignTexts = NAMES.flatMap((_, other) => (ownThreads.includes(other) ? [] : [`Question ${other}`, `Answer ${other}`]));
    const foreignWishes = NAMES.filter((other) => other !== name && other !== receiver).map((other) => `Wish of ${other}`);
    const states = mine.filter((answer) => answer.url.endsWith("/state") && answer.body.startsWith("{"));
    const masks = mine.filter((answer) => /\/mask$/.test(answer.url) && answer.body.startsWith("{"));
    expect(states.length, `${name}: state answers recorded`).toBeGreaterThan(0);
    expect(masks.length, `${name}: mask answers recorded`).toBeGreaterThan(0);

    for (const answer of mine) {
      const where = `${name}: ${answer.url}`;
      // No field of a database row, and no text of a thread or a wish list that is not theirs.
      expect(answer.body, where).not.toMatch(/giver|person_id|member_id|room_id|return_hash/i);
      for (const text of [...foreignTexts, ...foreignWishes]) expect(answer.body, where).not.toContain(text);
    }
    for (const answer of states) {
      const state = JSON.parse(answer.body);
      expect(state.reveal.pairs, `${name}: revealed pairs`).toEqual([]);
      expect([null, receiver], `${name}: receiver name`).toContain(state.draw.receiverName);
      expect([null, JSON.stringify([`Wish of ${receiver}`])], `${name}: receiver wishes`).toContain(state.wishes.receiver && JSON.stringify(state.wishes.receiver));
    }
    for (const answer of masks) {
      const body = JSON.parse(answer.body);
      const receiving = body.threads ? body.threads.receiving : body.thread?.side === "receiving" ? body.thread : null;
      if (!receiving) continue;
      // The thread with the secret giver: no name of any member and no user id of any member.
      expect(receiving.withName, `${name}: mask name`).toBeNull();
      const text = JSON.stringify(receiving);
      for (const secret of [...NAMES, ...talkIds]) expect(text, `${name}: ${answer.url}`).not.toContain(secret);
    }

    // The page itself: no foreign text, and the thread with the giver names no member.
    const source = await pages[name].content();
    for (const text of [...foreignTexts, ...foreignWishes]) expect(source, `${name}: page source`).not.toContain(text);
    const giverThread = await pages[name].getByRole("region", { name: "Your talk with your secret giver" }).innerText();
    for (const other of NAMES) expect(giverThread, `${name}: giver thread`).not.toContain(other);
    // Control: the one fact this person owns is on the page.
    expect(source).toContain(`Wish of ${receiver}`);
  }
  for (const name of NAMES.slice(1)) await pages[name].context().close();
});
