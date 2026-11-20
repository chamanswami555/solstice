-- Gate 3 schema: demo members, removal before the draw, and counters for rate limits.

-- A demo member is played by the website and is no person: it has no identity and never connects to chat.
alter table members alter column person_id drop not null;
alter table members add column is_demo boolean not null default false;
alter table members add constraint members_demo_is_no_person check (is_demo = (person_id is null));

-- One demo room for each person. A new start takes the place of the old room.
create unique index rooms_one_demo_for_each_organizer on rooms (organizer_id) where kind = 'demo';

-- A removed member keeps the row, so the same person cannot join the room again.
alter table members add column removed_at timestamptz;

-- One row for each counted key in each time window. The route adds one and reads the count in one statement.
create table rate_counters (
  key text not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  count integer not null check (count >= 1),
  primary key (key, window_start)
);
