-- Gate 2 schema: wish lists, gift notes, mask talk and its mute.
-- The caps here are the same numbers as in lib/limits.ts.

-- Up to 5 wishes for each member, in the member's own order.
create table wishes (
  member_id bigint not null references members (id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  body text not null check (char_length(body) between 1 and 120),
  primary key (member_id, position)
);

-- One note or link from a giver to the receiver of the pair. Shown at the reveal.
create table gift_notes (
  room_id bigint not null,
  giver_id bigint not null,
  body text not null check (char_length(body) between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (room_id, giver_id),
  foreign key (room_id, giver_id) references pairs (room_id, giver_id) on delete cascade
);

-- Mask talk. A thread is one pair, so a message can only exist between a giver and that giver's receiver.
create table mask_messages (
  id bigint generated always as identity primary key,
  room_id bigint not null,
  giver_id bigint not null,
  -- True when the giver wrote it, false when the receiver wrote it.
  from_giver boolean not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (room_id, giver_id) references pairs (room_id, giver_id) on delete cascade
);

create index mask_messages_thread on mask_messages (room_id, giver_id, id);

-- Who muted the thread of the pair. Null means that nobody did.
alter table pairs add column muted_by text check (muted_by in ('giver', 'receiver'));
