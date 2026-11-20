# Implementation Plan: Solstice V1

Source spec: `SPEC.md`. Task list: `tasks/todo.md`.

## Overview

Solstice is a website with rooms for a secret gift exchange. A group joins by one link, the server
draws one ring, a giver and a receiver talk through a mask, and the organizer reveals the pairs to
all members at the same time. PostgreSQL holds all state. Nexconn carries room talk and signals.
The build follows the five gates of the spec. Each task is one vertical slice that leaves the
website in a state that works.

## Architecture Decisions

- One Next.js application (App Router, TypeScript strict). Server routes are the only writers.
- Database access with the `pg` driver and plain SQL. A small migration runner applies
  `db/migrations/*.sql` in order, each in one transaction, and records it in a table.
  Reason: one dependency, the same code for local PostgreSQL and Neon.
- Invariants are database constraints: one draw for each room (unique), one giver and one receiver
  for each member (unique), unique display name in a room, reveal step with a compare-and-set update.
- Join and draw take the same row lock on the room (`select ... for update`), so a join cannot land
  inside a draw. The identity cap takes an advisory lock.
- The rule of each route lives in a `lib/` function with the pool and the person id as arguments.
  The route reads the cookie outside any try block, checks the body and calls it.
- Pages are static shells with a client component inside `Suspense`. No page reads a cookie. State
  comes from the state route, which answers with `Cache-Control: no-store`.
- Every error answer has one shape: `{ error: { code, message, fields } }`.
- One user action is one transaction. The draw takes a row lock on the room.
- Identity: a random person id in a signed, HTTP-only cookie (HMAC with a server secret, Node
  crypto). The return secret is in the URL fragment; the database stores its hash. The server
  refuses to start with a missing or placeholder secret.
- Nexconn on the server: the official Node SDK (GitHub tag v0.1.2) if task 2 shows that it works
  on the host. If not, a small signed client with `fetch`. Task 2 records the result here.
- Nexconn in the browser: `@nexconn/chat` and `@nexconn/engine`, loaded on the room screen only.
- The browser trusts no signal. A signal causes a load of the room state from one server route.
  The room screen also loads the state every 10 seconds.
- Response fields are allow-listed in one module (`lib/view.ts`). No route returns a database row.
- Limits and caps are in one file (`lib/limits.ts`).
- The product name is one constant (`lib/brand.ts`).
- Tests: Vitest for unit and integration tests against a separate local database. Playwright for
  browser tests. Tests that connect to Nexconn use fixed test user ids.
- User interface: one design direction and shared tokens before the first screen. Each screen is
  checked in a real browser engine for errors, keyboard use and computed contrast.

## Dependency Graph

```
config and secrets guard
    |
database schema and migrations ---- Nexconn smoke test (needs the owner's keys)
    |                                      |
identity (cookie, return link)       server client for Nexconn
    |                                      |
create room, join room --------------- room talk
    |
draw ---- reveal ---- deploy (gate 1)
    |
wish list, mask talk, gift note, word list (gate 2)
    |
demo room, usage page, limits, removal before the draw (gate 3)
    |
nudge, cheers, online status, draw card in room talk (gate 4)
    |
write-up, video, submission (gate 5)
```

## Phases

| Phase | Tasks | Gate | Live on the public URL by (IST) |
| --- | --- | --- | --- |
| Foundation | 1, 3, 4, 5 (done) | | |
| Thin round | 6, 8, 9, 10a, then 2, 7, 10b | 1 | 20 November, 23:00 |
| Secret talk | 11, 12a to 12d, 13, 14 | 2 | 21 November, 14:00 |
| Judge and safety | 15, 16, 17a, 17b, 18 | 3 | 21 November, 22:00 |
| Extras | 19a to 19e | 4 | 22 November, 12:00 |
| Submission | 20 to 22 | 5 | 22 November, 20:00 |

Tasks 6, 8, 9 and 10a need no Nexconn keys. The first deploy (10a) can go live with chat switched
off by an explicit flag. Tasks 2, 7 and 10b start when the keys arrive.

## Schema Plan

`001_init.sql` (applied): people, rooms, members, draws, pairs.

`002_gate2.sql` (with task 11):

- `wishes (member_id, position 1 to 5, body up to 120 characters)`, primary key (member_id, position).
- `gift_notes (room_id, giver_id, body up to 500 characters)`, primary key and foreign key to the pair.
- `mask_messages (id, room_id, giver_id, from_giver, body up to 1000 characters, created_at)`,
  foreign key to the pair. A thread is one pair.
- `pairs.muted_by`: null, `giver` or `receiver`.

`003_gate3.sql` (with task 15):

- `members.person_id` can be null, and `members.is_demo` marks a demo member. A check keeps the
  two in step: a demo member has no person.
- One demo room for each organizer: a unique index on `rooms (organizer_id)` where the kind is demo.
- `members.removed_at`: a removed member keeps the row, so the person cannot join again.
- `rate_counters (key, window_start, count)`, primary key (key, window_start).

A schema change after the first release needs the owner's yes. This plan is that request for 002 and 003.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The owner's keys and accounts arrive late | High | Tasks 6, 8, 9 and 10a need no keys. The first deploy can run with chat switched off by an explicit flag |
| The server SDK does not run on the host | Medium | Task 2 has a time box of 90 minutes, then the small signed client |
| A targeted custom message does not reach only the named member | High | Task 2 checks it with two connected test users before mask talk is built |
| Token expiry does not drop a connected member | Medium | Task 2 checks it. If it fails, removal also removes the member from the group and the state route refuses the member |
| The profanity filter needs a payment card | Low | The server word list covers all text except room talk. Room talk then goes through a server check too |
| The public URL is open before the limits of gate 3 | Medium | The identity cap is in task 6 (gate 1) |
| The database on the host sleeps | Low | The first screen and the health route are static and need no database |
| A slip of gate 1 | High | Gate 4 is the buffer. The cut list of the spec applies |

## Definition of Done for each task

1. Its acceptance criteria hold.
2. Unit and integration tests pass, and the build and the type check pass.
3. A new screen ran in a real browser engine with no uncaught error and no failed request.
4. The task list is ticked, and the project record has one line for the decision, if there was one.

## Open Questions

- The items in the Open Items table of the spec (keys, accounts, real groups).
- Whether the repository is public from the first push or made public at gate 5. The spec needs it
  public for the submission. Recommendation: private until gate 3, public after the scan of gate 5.

## Nexconn Smoke Test Results

Run on the real app on 20 November 2026 with `npm run test:smoke` (three fixed user ids, two fixed
channel ids, removed after each run).

- Decision: our own signed client (`lib/nexconn-server.ts`, one function), not the server SDK.
  Reason: the signature is one SHA-1 line, and the SDK is a dependency from a Git tag.
- Token issue, group create, join, room message, targeted custom message, token expiry and a
  profanity word all answer with code 0. No payment card was needed.
- A second create with the same channel id answers with code 25409. The token route treats this
  code as "the room exists".
- A join of a member who is already inside answers with code 0.
- Two browsers on the Chat SDK for Web: a targeted custom message from the server reached only the
  named member, in under half a second. The other member got the next room message and no signal.
- A browser that connects gets recent targeted messages again, also ones that it got before on
  another connection. So a signal can come late or two times. Each signal costs one more state
  load and nothing else.
- Token expiry gave two results in runs minutes apart. One time the user stayed connected and the
  old token still opened a new connection. One time the user was disconnected within 5 seconds
  and the old token was refused (code 31004). Removal uses the group channel, not token expiry.
- The profanity filter of Nexconn works on text messages from the browser SDK only. Mask talk
  goes through our server, so it uses our own word list.
- Hosts that the browser SDK used in the Singapore region, for the content security policy of
  task 7: `https://*.rongnav.com`, `https://dualstack-cloudcontrol.sg-light-edge.com`,
  `wss://ws.sg-light-edge.com`. The first one is a navigation host and its name can change.
