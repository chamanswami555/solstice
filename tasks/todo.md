# Task List: Solstice V1

Plan: `tasks/plan.md`. Spec: `SPEC.md`. Sizes: XS one file, S one or two, M three to five.
Verification commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run test:e2e`.

Rule for every task with a route: the rule lives in a `lib/` function that takes the database pool
and the person id as arguments. The route reads the cookie (outside any try block), checks the
body, and calls that function. Unit and integration tests call the `lib/` function. Browser tests
call the route.

Order of work: 6, 8, 9, 10a, then 2, 7, 10b when the Nexconn keys arrive, then gate 2.

## Done

- [x] Task 1: Application skeleton and config guard (S)
- [x] Task 3: Database schema and migration runner (M)
- [x] Task 4: Design direction and shared interface shell (S)
- [x] Task 5: Identity, create room, return link (M)

## Phase: Thin round (gate 1)

- [x] Task 6: Join room (M)
  - Acceptance: a person opens the invite link, enters a display name and is in the room. A new
    identity gets a return link one time. Join takes a row lock on the room: before the draw the
    role is `member`, after it `guest`. The 41st person is refused. A display name that is in the
    room gets status 409 with a sentence for the field. The total identity cap refuses a new
    identity, with an advisory lock so two requests cannot pass it together.
  - Verify: integration tests for each rule, one with two joins at the same time; browser test
    with two browsers.
  - Dependencies: 5.
  - Files: modify `lib/rooms.ts`, `lib/people.ts`, `lib/limits.ts`, `lib/validate.ts`,
    `components/room.tsx`; create `app/api/rooms/[code]/members/route.ts`,
    `components/join-form.tsx`, `tests/join.test.ts`, `tests/helpers/rooms.ts`, `e2e/join.spec.ts`.
  - Note: the room state for an outsider must show the room name and the join form, and nothing else.

- [x] Task 8: Draw (M)
  - Acceptance: only the organizer can draw (others get status 403). Fewer than 3 members is
    refused (409). The draw is one ring over members, not guests, for every size from 3 to 40.
    The order of the reveal is shuffled apart from the ring. Two requests at the same time make
    one draw. Each member sees only their own draw card, also after a reload. With 3 members the
    room shows the notice of the spec.
  - Verify: unit test over all sizes; concurrency test, and it fails when the lock is removed;
    integration test that a member's state holds no other pair.
  - Dependencies: 6.
  - Files: create `lib/draw.ts`, `app/api/rooms/[code]/draw/route.ts`, `components/draw-card.tsx`,
    `tests/draw.test.ts`; modify `lib/rooms.ts`, `components/room.tsx`.

- [x] Task 9: Reveal (M)
  - Acceptance: only the organizer moves the reveal. "Reveal next" moves one pair. Two taps at
    the same time move one step. All members see the same pairs. After the last pair the room
    shows the ring. A December room before its date asks the organizer to confirm.
  - Verify: concurrency test, and it fails when the compare-and-set is removed; browser run.
  - Dependencies: 8.
  - Files: create `lib/reveal.ts`, `app/api/rooms/[code]/reveal/route.ts`, `components/reveal.tsx`,
    `tests/reveal.test.ts`; modify `lib/rooms.ts`, `components/room.tsx`.

- [x] Task 10a: First deploy (M)
  - Acceptance: the website is live on the public URL with the hosted database. Production
    starts with chat switched off only when `CHAT=off` is set; with no keys and no flag it refuses
    to start. Security headers are on every response. The health URL answers, and a new visitor
    sees the first screen within 3 seconds after 30 idle minutes (criterion 9).
  - Verify: unit test of the flag in the config guard; header check with a request from outside;
    the browser tests against the public URL; the secret scan of the build output.
  - Dependencies: 9, and the owner's host and database accounts.
  - Files: modify `lib/config.ts`, `tests/config.test.ts`, `next.config.ts`, `README.md`.
    Host variables: `DATABASE_URL` (pooled), `SESSION_SECRET`, `NEXCONN_APP_KEY`,
    `NEXCONN_APP_SECRET`, `NEXCONN_REGION` or `CHAT=off`. The migration runs from the builder's
    machine with `npm run db:migrate` and the direct database URL.

- [x] Task 2: Nexconn smoke test (M, needs the owner's keys)
  - Acceptance: one script on the real Nexconn app issues and expires a token, creates a group,
    sends a room message, sends a targeted custom message that only the named test user receives,
    and reports whether the profanity filter works with no payment card, and whether token expiry
    drops a connected user. The plan records: server SDK or own client.
  - Verify: run the script; read its report; two fixed test user ids only.
  - Dependencies: 1. Files: create `lib/nexconn-server.ts`, `tests/nexconn.smoke.test.ts`; modify `tasks/plan.md`.

- [x] Task 7: Room talk on Nexconn (M)
  - Acceptance: the token route issues the member's access token and, idempotent, creates the
    group channel of the room and adds the member, so a room made before the keys arrived works.
    Two members send and receive messages and see the history after a reload. The App Secret is
    not in the browser bundle. The connection starts and stops in an effect with cleanup.
  - Verify: browser test with two browsers; a scan of the build output for the secret.
  - Dependencies: 2, 6.
  - Files: create `app/api/rooms/[code]/token/route.ts`, `lib/nexconn-client.ts`,
    `components/room-talk.tsx`, `e2e/room-talk.spec.ts`; modify `components/room.tsx`.

- [x] Task 10b: Signals (S)
  - Acceptance: a join, a draw and a reveal step send a signal, and every browser loads the new
    state. With the signal blocked, the state still arrives by the 10-second load. At the reveal,
    a second browser shows the pair within 2 seconds of the server commit (criterion 4, measured).
  - Verify: browser test with a blocked signal; the timed browser test.
  - Dependencies: 7, 9. Files: create `lib/signal.ts`, `e2e/signal.spec.ts`; modify `components/room.tsx`.

### Checkpoint: Gate 1
- [ ] Criteria 3, 6 and 11 of the spec hold on the public URL. Review with the owner.

## Phase: Secret talk (gate 2)

- [x] Task 11: Wish list (S)
  - Acceptance: a member writes 5 wishes at most and changes them until the reveal. The giver sees
    the wishes of the receiver after the draw. Migration 002 is applied.
  - Verify: integration tests; browser run. Dependencies: 8.
  - Files: create `db/migrations/002_gate2.sql`, `lib/wishes.ts`,
    `app/api/rooms/[code]/wishes/route.ts`, `components/wishes.tsx`, `tests/wishes.test.ts`.

- [x] Task 12a: Mask talk, server (M)
  - Acceptance: a giver and a receiver post to one route. The server checks the pair, the length
    cap and the rate limit, stores the message, and returns the thread with no giver name and no
    giver id for the receiver before the reveal. After the last pair of the reveal, the thread
    shows the giver's name.
  - Verify: integration tests for pair checks and for the fields of the answer.
  - Dependencies: 8, 11. Files: create `lib/mask.ts`, `app/api/rooms/[code]/mask/route.ts`, `tests/mask.test.ts`.

- [x] Task 12b: Mask talk, threads on screen (M)
  - Acceptance: each member has two threads on the room screen. A new message shows in the other
    browser after a signal, or within 10 seconds with no signal.
  - Verify: browser test with two browsers. Dependencies: 12a, 10b.
  - Files: create `components/mask-thread.tsx`, `e2e/mask.spec.ts`; modify `components/room.tsx`, `lib/signal.ts`.

- [x] Task 12c: Mute (S)
  - Acceptance: each side can mute a thread. The server refuses a message in a muted thread and
    tells the sender "This thread is muted".
  - Verify: integration test; browser run. Dependencies: 12a. Files: modify `lib/mask.ts`, `components/mask-thread.tsx`, `tests/mask.test.ts`.

- [ ] Task 12d: Leak test (S)
  - Acceptance: with 4 members, before the reveal, no server response, page source or received
    Nexconn message links a giver to a pair for the receiver, the organizer or a third member.
  - Verify: the browser test reads every response and message; it fails when the allow-list is removed.
  - Dependencies: 12b. Files: create `e2e/leak.spec.ts`.

- [ ] Task 13: Gift note (S)
  - Acceptance: in a tonight round a giver types one note. The organizer sees the count only. The
    reveal shows the note or "No note yet". The last reveal screen has the button "Start your
    December room".
  - Verify: integration tests; browser run. Dependencies: 9, 12a.
  - Files: create `lib/notes.ts`, `app/api/rooms/[code]/note/route.ts`, `components/gift-note.tsx`, `tests/notes.test.ts`.

- [ ] Task 14: Word list, length caps, reserved names (S)
  - Acceptance: every text field has a cap. The server refuses listed words in room names, display
    names, wishes, notes and mask messages. A display name cannot be a reserved word. Room talk
    uses the Nexconn profanity filter with the same list. The list is written by the builder in
    `lib/words.ts`.
  - Verify: unit tests; the smoke test for the filter. Dependencies: 2, 12a.
  - Files: create `lib/words.ts`, `tests/words.test.ts`; modify `lib/validate.ts`, `lib/limits.ts`.

### Checkpoint: Gate 2
- [ ] Criteria 1, 2, 4 and 9 hold on the public URL. Four real people finish a tonight round.
- [ ] The owner claims the Chat Growth Credit. Real groups start.

## Phase: Judge and safety (gate 3)

- [ ] Task 15: Demo room (M)
  - Acceptance: a visitor alone finishes the draw, mask talk and the reveal in 3 minutes or less.
    Three demo members carry the "Demo" label, have wishes, and never connect to Nexconn. Each
    demo action runs inside the visitor's own request: the draw; a fixed answer when the visitor
    asks the receiver a question; one fixed question from the visitor's secret giver when the
    visitor opens that thread; the reveal. One demo room for each identity, and it can restart.
    Migration 003 is applied. Demo members are not people rows and do not count in any cap.
  - Verify: browser test measures the time. Dependencies: 13.
  - Files: create `db/migrations/003_gate3.sql`, `lib/demo.ts`, `app/api/demo/route.ts`,
    `components/demo-banner.tsx`, `e2e/demo.spec.ts`.

- [ ] Task 16: Usage page (S)
  - Acceptance: a public page shows rooms, people, draws and reveals by kind of room, with demo
    rooms apart. Every number comes from one database query at request time.
  - Verify: integration test against seeded rows. Dependencies: 13. Files: create `app/usage/page.tsx`, `lib/usage.ts`, `tests/usage.test.ts`.

- [ ] Task 17a: Rate limits (S)
  - Acceptance: 10 rooms for each IP address in an hour and 20 mask messages for each member in a
    minute, counted in the database. A refused request gets status 429 with a plain sentence.
  - Verify: one integration test for each limit. Dependencies: 12a.
  - Files: create `lib/rate.ts`, `tests/rate.test.ts`; modify `lib/limits.ts`, the two routes.

- [ ] Task 17b: Removal before the draw (S)
  - Acceptance: only the organizer removes a member, and only before the draw. The member row
    gets a removal mark, so the person cannot join again and gets no state. The server expires the
    member's access token and removes the member from the group channel.
  - Verify: integration tests; the smoke test result for token expiry. Dependencies: 6, 7.
  - Files: create `app/api/rooms/[code]/members/[name]/route.ts`; modify `lib/rooms.ts`, `components/room.tsx`, `tests/join.test.ts`.

- [ ] Task 18: Keyboard and contrast pass (S)
  - Acceptance: every action works with the keyboard only. Focus is visible. Each text and
    background pair has a contrast of 4.5 to 1 or more, computed from the tokens.
  - Verify: a browser test walks the full flow with the keyboard. Dependencies: 15.
  - Files: create `e2e/keyboard.spec.ts`; modify `app/globals.css` where a check fails.

### Checkpoint: Gate 3
- [ ] Criteria 5, 7, 8 and 10 hold. Security review of the routes. Failure-mode checkpoint written.

## Phase: Extras (gate 4). Cut from the bottom up.

- [ ] Task 19a: Nudge button with a text that names nobody (S). Files: `components/nudge.tsx`.
- [ ] Task 19b: Cheers at the reveal as custom messages (S). Files: `components/reveal.tsx`.
- [ ] Task 19c: Online status before the draw, off after it (S). Files: `components/room.tsx`.
- [ ] Task 19d: Draw card in room talk as a targeted message (S). Files: `lib/signal.ts`.
- [ ] Task 19e: Longer demo script (S). Files: `lib/demo.ts`.
  - Each item: it works alone in a browser run, or it is removed, not left half done.

## Phase: Submission (gate 5, fixed)

- [ ] Task 20: Repository front page and write-up PDF (M)
  - Acceptance: the first screen of the README has the tagline, the headline number from the usage
    page, one image and the video link. The PDF holds the problem, the SDK features with where they
    run, the App Key and the traction proof. Each row of the SDK table in the spec has a test that
    ran. Document properties name no build software.
  - Verify: text of the PDF decoded and compared with its source; scan of the properties.
  - Files: `README.md`, `docs/write-up.md`, `docs/build-write-up.py`, `docs/images/`.

- [ ] Task 21: Public release scan (S)
  - Acceptance: no secret, no personal or organisation identifier and no name of build software in
    the tracked tree or in the history of any ref. The dependency audit has no high finding.
  - Verify: the scans run as a gate before the push. Files: none in the repository.

- [ ] Task 22: Video and submission form (S, with the owner)
  - Acceptance: the owner records the video from the script in the spec. The form holds the live
    URL, the repository, the video, the PDF, the App Key and the real traction numbers.
  - Verify: each link opens in a private browser window. Files: `docs/submission-form.md`.

### Checkpoint: Complete
- [ ] The spec's success criteria are walked line by line against the public URL, gaps first.
