# Spec: Solstice V1

Solstice is a website with rooms for a secret gift exchange.

Status: approved by the owner on 19 November 2026. Last revision: 19 November 2026.
The task plan is `tasks/plan.md`. The task list with its state is `tasks/todo.md`.

## Context

- Event: Nexconn Build Challenge 2026, an online contest that Reskilll operates for Nexconn.
- Submission closes on 22 November 2026 at 23:59 IST. Judges score from 23 to 27 November.
- Score: completeness and user experience 50 percent, innovation 30 percent, business and traction
  20 percent. For traction, the judges count the active users of our Nexconn app.
- Deliverables: a live URL, a public repository, a demo video, a write-up in PDF.
- Roles: the owner decides and operates the accounts. The builder writes the code and the
  documents. "Ask first" means: ask the owner.

### Glossary

Nexconn documentation: <https://docs.nexconn.ai>

| Term | Meaning here |
| --- | --- |
| Nexconn | A hosted chat service with a browser library and a server API |
| Chat SDK for Web | The browser library (`@nexconn/chat` with `@nexconn/engine`) |
| Platform Chat API | The server API of Nexconn. Our server calls it with signed requests |
| Nexconn app | Our application record in the Nexconn console. It has an App Key and an App Secret |
| Access token | What a browser needs to connect as one Nexconn user. Our server issues it |
| Group channel | A chat of many users |
| Targeted message | A group message that only named members receive |
| Custom message | A message with our own type and fields |
| Profanity filter | A word list in Nexconn that blocks or replaces listed words in text messages |
| Automatic moderation | A paid Nexconn service that checks content with a model. Not used |
| Giver, receiver | In a pair, the giver gives a gift to the receiver |
| Ring | The draw result: each member gives to the next member in a shuffled order |
| Draw card | The private notice "You give to (name)" |
| Signal | A Nexconn message that tells a browser to load new state from our server |

## Goals and Non-Goals

Goals:

1. A group finishes a secret gift exchange in one room, from one link, with no accounts.
2. A giver and a receiver can talk before the reveal, and the receiver cannot learn who the giver is.
3. Real groups finish a full round before the submission deadline.
4. A judge alone can see the full flow in 3 minutes or less.

Non-Goals: accounts and login, payments, delivery addresses, reminders by email or SMS, native
apps, push notifications, voice and video.

## Problem

The name draw is the easy part of a secret gift exchange. The hard part is communication. A giver
wants to ask "what size?" or "do you already have this?", and a direct question ends the secret.
Groups in different cities cannot do the reveal in one room.

## Users

- Organizer: creates the room, starts the draw, starts the reveal, can remove a member before the draw.
- Member: joins by link, writes a wish list, talks in the room, uses mask talk, watches the reveal.
- Guest: a person who joins after the draw. A guest has room talk and the reveal, and no pair.
- Visitor alone (a judge or a new user): uses a demo room with labelled demo members.

## Product Behaviour

### Two kinds of room, one flow

- December room: the exchange date is in the future. The website shows the date and the budget and
  does not enforce them. The room stays masked until the organizer starts the reveal. Before the
  date, the website asks the organizer to confirm an early reveal.
- Tonight round: a preset on the create screen. The date is today and the budget is zero. The gift
  is a note or a link that the giver types. The website shows it at the reveal.
  Target: a group finishes a tonight round in 15 minutes.
  The last reveal screen has one button: "Start your December room".

Goal: real groups finish a tonight round before the deadline, and December rooms stay active from
23 to 27 November.

### User flow

1. Create. The organizer enters a room name and a display name, and selects "December room" or
   "Tonight round". The website shows an invite link and the organizer's return link.
2. Join. A person opens the invite link and enters a display name. The website shows a private
   return link one time. The return link opens the same identity on a second device.
3. Room talk. All members talk in one room channel. Before the draw, they see who is online.
4. Wish list. Each member writes 5 wishes at most. A member can change wishes until the reveal.
5. Draw. The organizer starts the draw. Each member sees a draw card: "You give to (name)".
   With exactly 3 members the website says: "With 3 people you can work out your giver. Invite a 4th."
6. Mask talk. Each member has two private threads. The first thread is with the receiver. There,
   the website shows the member as "Your secret giver". The second thread is with the member's own
   secret giver. The composer says: "Your name is shown at the reveal."
   Each side can mute the thread.
7. Gift note (tonight round only). After the draw, each giver types one note or link for the
   receiver. The organizer sees how many notes are in, and not their text.
8. Reveal. The organizer taps "Reveal next". All members see one pair at the same time, and in a
   tonight round the note. A missing note shows as "No note yet". Members send cheers. After the
   last pair, masks are off: each mask thread shows the name of the giver, and the room shows the ring.
9. Demo room. A visitor alone starts a demo room with three members that carry a "Demo" label.
   Each action of the visitor makes the demo members act. The visitor sees the draw, mask talk and
   the reveal in 3 minutes or less.
10. Nudge. A "Nudge the group" button opens the share sheet of the phone. The text names nobody:
    "Someone has a secret question waiting", with the room link.
11. Usage page. A public page shows counts from the database: rooms, people, draws, reveals, by
    kind of room. Demo rooms are shown apart.

### Rules

- A draw needs 3 or more members. A room has 40 people at most, members and guests together.
- The draw is one ring. Nobody draws their own name. A room has one draw. The database refuses a second.
- Display names are unique in a room. A name cannot be a reserved word such as "Your secret giver".
- Room names, display names, wishes, gift notes and mask messages have length caps. The server
  checks each of them against the same word list that the profanity filter uses.
- The organizer can remove a member before the draw. A removed member loses the room at once: the
  server expires the member's access token, removes the member from the group channel and refuses
  all requests of that member for the room. After the draw, removal is not in V1.
- A person who joins after the draw is a guest.

## Architecture

### Assumptions

1. The website is mobile-first. People join with a link and a display name only.
2. No payment card is bound to the Nexconn account. Automatic moderation is not available.
3. One builder and about 3 days. Scope is cut before quality, in the order of the cut list.

### State ownership

PostgreSQL is the one source of truth. It holds rooms, people, members, wishes, the ring, gift
notes, mask messages, mutes, the reveal step and rate counters. A server route gives each browser
only the state that this person may see.

Nexconn carries live messages. The browser sends and receives room talk through the Chat SDK for
Web, and Nexconn keeps the room talk history. Every other Nexconn message is a signal: the browser
loads the new state from our server and never trusts the content of a signal. A forged signal can
only cause one more load.

The server writes the reveal step with a compare-and-set on the step number. Two taps at the same
time move the reveal by one pair.

Each browser has one identity (a random Nexconn user id), made at the first join or demo start.
The return link opens the same identity on a second device. The server stores a hash of the return
secret. The secret is in the URL fragment.

### Mask talk: the data flow

1. The browser posts the text to one server route. It does not send mask messages through the SDK.
2. The server checks that the sender belongs to the pair, that the thread is not muted, the length
   cap, the word list and the rate limit. It stores the message in PostgreSQL.
3. The server sends a signal through the Platform Chat API: a targeted custom message in the
   group channel, from one fixed system user, to the other person only. The signal carries the
   thread id. It carries no text and no sender.
4. The other browser receives the signal through the SDK and loads the thread from our server.
5. A server route gives the thread from PostgreSQL. Before the reveal, this route never returns
   the giver's name or user id to the receiver.
6. Mute: each side can mute the thread. The server then refuses mask messages in that thread and
   tells the sender "This thread is muted".

### How the Nexconn Chat SDK is used

| Product part | Nexconn feature | Sent by |
| --- | --- | --- |
| Room talk | Group channel, message history | Browser, SDK |
| Online members before the draw | Online status subscription | Browser, SDK |
| Live signal for mask talk | Targeted custom message in the group channel | Server, received by the SDK |
| Draw card in the room talk | Targeted message in the group channel | Server, received by the SDK |
| Draw, reveal step, removal | Custom message in the group channel, used as a signal | Server |
| Cheers | Custom message in the group channel | Browser, SDK |
| Bad words in room talk | Profanity filter with our word list | Nexconn |
| Identity and removal | Access token issue and expiry | Server |

Each row is a claim. A test must run before the row goes into the write-up.

### Tech stack

- TypeScript, Next.js (one application for pages and server routes), React.
- `@nexconn/chat` and `@nexconn/engine` in the browser.
- On the server, the official Node SDK of Nexconn if it installs and covers tokens and sends.
  If not, a small signed client.
- Our own user interface on the Chat SDK. The cards, the mask threads and the reveal need custom views.
- PostgreSQL on Neon, plain SQL migrations. Host: Vercel.
- Vitest for unit and integration tests. Playwright for browser tests.
- A browser request starts every step. No job runs in the background.

## Alternatives Considered

| Option | Rejected because |
| --- | --- |
| Shop chat with translation, live quiz, group buying (other ideas) | 7 or more entries already do translated shop chat. A quiz is not new. Group buying needs real goods and payment |
| React with Vite and a separate Node server | It needs an always-on host. Free always-on hosts sleep. Real-time goes through Nexconn, so short server routes are enough |
| Plain HTML with the Web Chat UI components | The components cover direct and group chat only. They cannot draw the cards, the mask threads or the reveal |
| Mask messages sent by the browser through the SDK | The receiver's browser gets the sender's real user id |
| Mask text in a Nexconn direct message from an alias user | A second copy of the text and one more kind of user. A signal with no text is enough |
| Mask history from the Nexconn history | Server sends are not kept in the sender's history by default. Each side sees half a thread after a reload |
| Reveal state in open channel metadata | A second copy of the state and a third kind of channel for one screen |
| A free derangement in place of one ring | A ring has the same secrecy for 4 or more members, and it is simple to check |
| Mask messages as streaming messages | The full text exists before the send. More API calls, no value for the user |

## Risks and Limits

| Risk or limit | Mitigation | Where checked |
| --- | --- | --- |
| A receiver learns the giver before the reveal | Mask signals carry no text and no sender, allow-listed response fields, online status off after the draw | Browser test, criterion 2 |
| Abuse in mask talk | Mute, word list, rate limit, "Your name is shown at the reveal" | Integration tests |
| A signal send fails after the database commit | State comes from the server on load. The browser also loads state every 10 seconds on the room screen | Browser test |
| The free Nexconn plan stops new connections at 2,000 monthly active users | A cap on the total number of identities from gate 1. The owner claims the Chat Growth Credit before gate 2 | Open items |
| The Nexconn count differs from the usage page | The system user and demo members never connect. We expect that Nexconn does not count them. Verify before the write-up, and explain the difference there | Smoke test |
| The profanity filter covers room talk only | The server checks the same word list on every other text | Integration test |
| The organizer loses the return link | The room cannot be revealed. The create screen says so and asks the organizer to save the link | Stated limit |
| The database sleeps when idle | The first screen is static and needs no database | Criterion 9 |
| Time: one builder, 5 gates | The cut list | Gates |

Scale limit of V1: 40 people in a room.

## Gates and Cut List

All times are IST. Gate 5 is fixed and is never cut.

| Gate | Content | Live on the public URL by |
| --- | --- | --- |
| 1 | Create, join, return link, room talk, draw, reveal of the pairs with no note, identity cap: one thin round | 20 November, 23:00 |
| 2 | Mask talk with mute, wish list, gift note, word list | 21 November, 14:00 |
| 3 | Demo room (short script), usage page, rate limits, removal before the draw | 21 November, 22:00 |
| 4 | Nudge, cheers, online status, draw card in the room talk, longer demo script | 22 November, 12:00 |
| 5 | Video, write-up, submission form | 22 November, 20:00 |

When time is short, apply the cut list first: gate 4 items in the order of the table row, from the
last to the first. Gates 1, 2, 3 and 5 are the product. Real groups start when gate 2 is live.

## Testing Strategy

- Unit: the draw for every size from 3 to 40, pair checks, input caps, the word list.
- Integration with real PostgreSQL: two draw requests at the same time make one draw. Two reveal
  taps at the same time move one step. A removed member gets no state. Rate limits count.
- Integration with Nexconn: one smoke test on the real Nexconn app. It covers token issue and
  expiry, a room message, a targeted signal, and the profanity filter. It is the first task of the plan.
- Browser: 4 members go from create to reveal. Before the reveal, the test reads every server
  response, the page source and every received Nexconn message of the receiver, the organizer and
  a third member. It fails if any of them links the giver to the pair.
- Tests use a separate database. Tests that connect to Nexconn use the same fixed test user ids on
  every run, so they add no new identities and no rows to the usage page.
- For the leak test and the two concurrency tests: remove the guard one time, and make sure that
  the test fails.

## Boundaries

- Always: validate every input at the server. Keep the App Secret on the server only. Run tests
  before a commit. Verify in a real browser before a claim. Label demo data as demo.
- Ask first: a new dependency, a schema change after the first release, a push, an account or
  console change, a payment card on the Nexconn account, a send of any text to an outside model.
- Never: commit a secret. Put personal or organisation identifiers in the repository. Show a number
  that the system did not produce. Count demo members or test users as real users.

## Success Criteria

1. (gate 2) Four real people on four phones go from the invite link to the reveal with no account.
2. (gate 2) Before the reveal, no server response, page source or Nexconn message links a giver to
   a pair for the receiver, the organizer or a third member. A browser test with 4 members checks this.
3. (gate 1) The draw is correct for every size from 3 to 40. Two requests at the same time make
   one draw. The database refuses a second draw.
4. (gate 2) At the reveal, a second browser shows the pair within 2 seconds of the server commit.
   The test measures the time.
5. (gate 3) A visitor alone finishes the demo room in 3 minutes or less.
6. (gate 1) A scan finds no App Secret in the browser bundle, the repository or its history.
7. Limits, set in one configuration file. From gate 1: a cap on the total number of identities,
   9,000 on the Chat Growth Credit plan (10,000 monthly active users; 1,800 before it). From gate 3: 10 rooms for each IP address in an
   hour, 60 new people (requests with no identity) for each IP address in an hour, one demo room
   for each identity (it can restart), 20 mask messages for each member in a minute, 300 stored
   messages in one mask thread, and no new mask message when the database is above 800 MB. A test
   checks each limit.
8. (gate 3) A user can do every action with the keyboard only. Text contrast is 4.5 to 1 or more, computed.
9. (gate 2) The health URL answers: 200 when the database answers, 503 when it does not. After 30 minutes with no request, a new visitor sees the first
   screen within 3 seconds.
10. (gate 3) The usage page shows counts by kind of room, with demo rooms apart.
11. (gate 1) A person who opens the return link on a second device has the same identity, and sees
    the draw card after a reload.

If gate 4 is cut, every criterion stays.

### Numbers and video

Headline number, decided before the build: real groups and real people who completed a draw before
the deadline, from the usage page.

Video script, about 2 minutes:

1. The problem in one sentence.
2. Create a tonight round. Three phones join.
3. Wishes, the draw, the draw card.
4. A question through the mask and its answer.
5. The reveal on four screens.
6. The usage page with the real counts.

## Deferred

- Gift helper with an outside model, and streaming messages for its answers: first item after gate 4,
  with the owner's approval and key.
- Translation of room talk: the free allowance is 50,000 characters.
- Removal after the draw, with a repair of the ring.
- Rules such as "these two people must not draw each other".
- Automatic moderation: it needs a payment card.

## Open Items

| Item | Owner | Needed by |
| --- | --- | --- |
| App Key and data center. The owner puts the App Secret into a local file | Owner | 20 November, 10:00 |
| GitHub account and repository name | Owner | 20 November, 10:00 |
| Vercel and Neon accounts | Owner | 20 November, 10:00 |
| Claim the Chat Growth Credit for the one Nexconn app | Owner | Before gate 2 |
| Number of real groups for a tonight round on 21 and 22 November | Owner | Before gate 2 |
| The word list, and a check that the profanity filter needs no payment card | Builder | Gate 2 |
