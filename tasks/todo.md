# Task List: Solstice V1

Plan: `tasks/plan.md`. Spec: `SPEC.md`. Sizes: XS one file, S one or two, M three to five.
Verification commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run test:e2e`.

## Phase: Foundation

- [ ] Task 1: Application skeleton and config guard (S)
  - Acceptance: the application starts and shows a static first screen. `GET /api/health` answers
    `ok`. The server refuses to start when a required secret is missing or is a placeholder.
  - Verify: unit test of the config guard; build; the first screen in a browser engine.
  - Dependencies: none. Files: `package.json`, `app/page.tsx`, `app/api/health/route.ts`, `lib/config.ts`, `lib/brand.ts`.

- [ ] Task 2: Nexconn smoke test (M, needs the owner's keys)
  - Acceptance: one script on the real Nexconn app issues and expires a token, sends a room
    message, sends a targeted custom message that only the named test user receives, and reports
    whether the profanity filter works with no payment card. The plan records: server SDK or own client.
  - Verify: run the script; read its report; two fixed test user ids only.
  - Dependencies: 1. Files: `lib/nexconn-server.ts`, `tests/nexconn.smoke.test.ts`, `tasks/plan.md`.

- [ ] Task 3: Database schema and migration runner (M)
  - Acceptance: `npm run db:migrate` builds the schema on an empty database and is safe to run
    again. Constraints refuse: a second draw for a room, a duplicate display name in a room, a
    member with two receivers.
  - Verify: integration tests on a separate test database, one for each constraint.
  - Dependencies: 1. Files: `db/migrate.mjs`, `db/migrations/001_init.sql`, `lib/db.ts`, `tests/schema.test.ts`.

- [ ] Task 4: Design direction and shared interface shell (S)
  - Acceptance: one design direction, shared tokens (colour, type, spacing), a page shell and the
    form and button components. Text contrast is 4.5 to 1 or more, computed.
  - Verify: the design lint check; a browser engine render at phone width and desktop width.
  - Dependencies: 1. Files: `app/layout.tsx`, `app/globals.css`, `components/ui/*`.

### Checkpoint: Foundation
- [ ] Tests, type check, lint and build pass. The owner's keys are in the local file.

## Phase: Thin round (gate 1)

- [ ] Task 5: Identity, create room, return link (M)
  - Acceptance: an organizer creates a room and gets an invite link and a return link. The return
    link opens the same identity in a second browser. The cookie is signed and HTTP-only.
  - Verify: integration tests (cookie tamper is refused, return secret is stored as a hash); browser run.
  - Dependencies: 3, 4. Files: `lib/identity.ts`, `app/api/rooms/route.ts`, `app/page.tsx`, `app/r/[code]/page.tsx`, `tests/identity.test.ts`.

- [ ] Task 6: Join room, room state route, identity cap (M)
  - Acceptance: a person joins with a unique display name. One route returns the room state through
    the allow-list. A person outside the room gets nothing. The total identity cap refuses new identities.
  - Verify: integration tests for each rule; browser run with two browsers.
  - Dependencies: 5. Files: `app/api/rooms/[code]/join/route.ts`, `app/api/rooms/[code]/state/route.ts`, `lib/view.ts`, `lib/limits.ts`, `tests/join.test.ts`.

- [ ] Task 7: Room talk on Nexconn (M)
  - Acceptance: two members send and receive messages in the room and see the history after a
    reload. The App Secret is not in the browser bundle.
  - Verify: browser test with two browsers; a scan of the build output for the secret.
  - Dependencies: 2, 6. Files: `app/api/rooms/[code]/token/route.ts`, `lib/nexconn-client.ts`, `components/room-talk.tsx`, `e2e/room-talk.spec.ts`.

- [ ] Task 8: Draw (M)
  - Acceptance: the draw is one ring for every size from 3 to 40. Two requests at the same time
    make one draw. Each member sees only their own draw card, also after a reload.
  - Verify: unit test over all sizes; concurrency test; the test fails when the lock is removed.
  - Dependencies: 6. Files: `lib/draw.ts`, `app/api/rooms/[code]/draw/route.ts`, `components/draw-card.tsx`, `tests/draw.test.ts`.

- [ ] Task 9: Reveal (M)
  - Acceptance: "Reveal next" moves one pair. Two taps at the same time move one step. All members
    see the same pair. After the last pair the room shows the ring.
  - Verify: concurrency test; the test fails when the compare-and-set is removed; browser run.
  - Dependencies: 8. Files: `app/api/rooms/[code]/reveal/route.ts`, `components/reveal.tsx`, `tests/reveal.test.ts`.

- [ ] Task 10: Signals, then the first deploy (M)
  - Acceptance: a draw or a reveal step sends a signal and every browser loads the new state. The
    state also loads every 10 seconds. The website is live on the public URL with the hosted database.
  - Verify: browser test with a blocked signal still shows the new state; health URL answers; secret scan.
  - Dependencies: 7, 9. Files: `lib/signal.ts`, `components/room.tsx`, host configuration.

### Checkpoint: Gate 1
- [ ] Criteria 3, 6 and 11 of the spec hold on the public URL. Review with the owner.

## Phase: Secret talk (gate 2)

- [ ] Task 11: Wish list (S)
  - Acceptance: a member writes 5 wishes at most and changes them until the reveal. The giver sees
    the wishes of the receiver after the draw.
  - Verify: integration tests; browser run. Dependencies: 8.
  - Files: `app/api/rooms/[code]/wishes/route.ts`, `components/wishes.tsx`.

- [ ] Task 12: Mask talk with mute (M)
  - Acceptance: a giver and a receiver exchange messages in real time. Before the reveal, nothing
    the receiver, the organizer or a third member gets links the giver to the pair. Each side can mute.
  - Verify: the leak test with 4 members in a browser; the test fails when the allow-list is
    removed; integration tests for pair checks and mute.
  - Dependencies: 10. Files: `app/api/rooms/[code]/mask/route.ts`, `lib/mask.ts`, `components/mask-thread.tsx`, `e2e/leak.spec.ts`.

- [ ] Task 13: Tonight round and gift note (S)
  - Acceptance: the create screen has both kinds of room. A giver types one note. The organizer
    sees the count only. The reveal shows the note or "No note yet".
  - Verify: integration tests; browser run. Dependencies: 9, 12.
  - Files: `app/api/rooms/[code]/note/route.ts`, `components/gift-note.tsx`.

- [ ] Task 14: Word list, length caps, reserved names (S)
  - Acceptance: every text field has a cap. The server refuses listed words in names, wishes,
    notes and mask messages. Room talk uses the Nexconn profanity filter with the same list.
  - Verify: unit tests; the smoke test for the filter. Dependencies: 2, 12.
  - Files: `lib/words.ts`, `lib/limits.ts`, `tests/words.test.ts`.

### Checkpoint: Gate 2
- [ ] Criteria 1, 2, 4 and 9 hold on the public URL. Four real people finish a tonight round.
- [ ] The owner claims the Chat Growth Credit. Real groups start.

## Phase: Judge and safety (gate 3)

- [ ] Task 15: Demo room (M)
  - Acceptance: a visitor alone finishes the draw, mask talk and the reveal in 3 minutes or less.
    Demo members carry the "Demo" label and never connect to Nexconn. One demo room for each identity.
  - Verify: browser test measures the time. Dependencies: 13.
  - Files: `lib/demo.ts`, `app/api/demo/route.ts`, `components/demo-banner.tsx`, `e2e/demo.spec.ts`.

- [ ] Task 16: Usage page (S)
  - Acceptance: a public page shows rooms, people, draws and reveals by kind of room, with demo
    rooms apart. Every number comes from one database query.
  - Verify: integration test against seeded rows. Dependencies: 13. Files: `app/usage/page.tsx`, `lib/usage.ts`.

- [ ] Task 17: Rate limits and removal before the draw (M)
  - Acceptance: the limits of criterion 7 hold. The organizer removes a member before the draw; the
    member's token expires and the member gets no state.
  - Verify: one integration test for each limit; removal test. Dependencies: 6.
  - Files: `lib/limits.ts`, `lib/rate.ts`, `app/api/rooms/[code]/remove/route.ts`, `tests/limits.test.ts`.

- [ ] Task 18: Keyboard and contrast pass (S)
  - Acceptance: every action works with the keyboard only. Focus is visible. Contrast is computed.
  - Verify: browser test that walks the flow with the keyboard. Dependencies: 15.

### Checkpoint: Gate 3
- [ ] Criteria 5, 7, 8 and 10 hold. Security review of the routes. Failure-mode checkpoint written.

## Phase: Extras (gate 4, cut first)

- [ ] Task 19: Nudge, cheers, online status before the draw, draw card in room talk, longer demo script (M)
  - Acceptance: each item works alone; a failed item is removed, not left half done.
  - Verify: browser run for each item. Dependencies: gate 3.

## Phase: Submission (gate 5, fixed)

- [ ] Task 20: Repository front page and write-up PDF (M)
  - Acceptance: the first screen of the README has the tagline, the headline number from the usage
    page, one image and the video link. The PDF holds the problem, the SDK features with where they
    run, the App Key and the traction proof. Document properties name no build software.
  - Verify: text of the PDF decoded and compared with its source; scan of the properties.

- [ ] Task 21: Public release scan (S)
  - Acceptance: no secret, no personal or organisation identifier and no name of build software in
    the tracked tree or in the history of any ref. Dependency audit has no high finding.
  - Verify: the scans run as a gate before the push.

- [ ] Task 22: Video and submission form (S, with the owner)
  - Acceptance: the owner records the video from the script in the spec. The form holds the live
    URL, the repository, the video, the PDF, the App Key and the real traction numbers.
  - Verify: each link opens in a private browser window.

### Checkpoint: Complete
- [ ] The spec's success criteria are walked line by line against the public URL, gaps first.
