-- Removal before the draw. The member row of a removed person is deleted, so no query can show the
-- person as a member of the room. This table keeps the same person from joining that room again.
-- The column members.removed_at of migration 003 is not used: a mark on the row would need a check
-- in every query that reads a member.
create table room_removals (
  room_id bigint not null references rooms (id) on delete cascade,
  person_id text not null references people (id),
  removed_at timestamptz not null default now(),
  primary key (room_id, person_id)
);
