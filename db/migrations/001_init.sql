-- Gate 1 schema: people, rooms, members, the draw and its pairs.
-- Every rule that must always hold is a constraint here, not only a check in the application.

create table people (
  -- Random id. It is also the Nexconn user id, so letters and digits only.
  id text primary key check (id ~ '^[A-Za-z0-9-]{8,64}$'),
  -- SHA-256 of the return secret. The secret itself is never stored.
  return_hash text not null unique,
  created_at timestamptz not null default now()
);

create table rooms (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('december', 'tonight', 'demo')),
  exchange_date date,
  budget text check (char_length(budget) <= 40),
  organizer_id text not null references people (id),
  -- Number of pairs already shown. The reveal route moves it with a compare-and-set update.
  reveal_step integer not null default 0 check (reveal_step >= 0),
  created_at timestamptz not null default now()
);

create table members (
  id bigint generated always as identity primary key,
  room_id bigint not null references rooms (id) on delete cascade,
  person_id text not null references people (id),
  display_name text not null check (char_length(display_name) between 1 and 30),
  role text not null check (role in ('member', 'guest')),
  joined_at timestamptz not null default now(),
  unique (room_id, person_id),
  -- Target of the pair foreign keys: a pair can only name members of its own room.
  unique (room_id, id)
);

-- A display name is unique in its room, in any letter case.
create unique index members_room_name_key on members (room_id, lower(display_name));

-- One row for each room that has a draw. The primary key refuses a second draw.
create table draws (
  room_id bigint primary key references rooms (id) on delete cascade,
  drawn_at timestamptz not null default now()
);

create table pairs (
  room_id bigint not null references draws (room_id) on delete cascade,
  giver_id bigint not null,
  receiver_id bigint not null,
  -- Order of the reveal, from 1.
  position integer not null check (position >= 1),
  primary key (room_id, giver_id),
  unique (room_id, receiver_id),
  unique (room_id, position),
  check (giver_id <> receiver_id),
  foreign key (room_id, giver_id) references members (room_id, id),
  foreign key (room_id, receiver_id) references members (room_id, id)
);
