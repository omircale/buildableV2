-- Design-studio projects saved to the account, so the office and the phone on site open the same one.
--
-- `data` is the project exactly as the studio keeps it on the device (decisions only; the proposal is
-- recomputed). `version` goes up with every save; a save names the version it started from, so a save
-- from a device that has not seen the latest one is refused instead of silently overwriting it.
create table studio_projects (
  id text primary key,
  owner_id text not null references users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  data text not null,
  version integer not null default 1 check (version >= 1),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index studio_projects_owner_idx on studio_projects (owner_id, updated_at);

-- The site no longer asks Google for the name, so it does not keep the ones it already has.
update users set name = null;
