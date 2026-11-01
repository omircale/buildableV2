-- Accounts, folders and saved bills, on Cloudflare D1.
--
-- The same model the app had on Supabase, written for SQLite. Who may see what is enforced by the
-- Worker on every request, not by the database: each query below the API carries the account it acts
-- for, and nothing reads another account's rows.

-- A person, as Google knows them. The id is Google's stable subject; the address can change.
create table users (
  id text primary key,
  email text not null unique check (email = lower(email)),
  name text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Who is admitted, and as what. Signing in alone admits nobody.
create table app_users (
  user_id text primary key references users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Addresses the admin has invited. Whoever signs in with one becomes a member.
create table invited_emails (
  email text primary key check (email = lower(email) and length(email) between 3 and 320),
  invited_by text references users (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A signed-in browser. Only a hash of the cookie's token is kept, so a copy of the table opens nothing.
create table sessions (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at text not null
);
create index sessions_user_idx on sessions (user_id);

-- A folder: a site the account works on — a hotel, a branch, an office floor.
create table places (
  id text primary key,
  owner_id text not null references users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index places_owner_idx on places (owner_id);

-- A surveyed project saved to the account, exactly as the app exports it.
create table bills (
  id text primary key,
  owner_id text not null references users (id) on delete cascade,
  place_id text references places (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 200),
  data text not null,
  rooms integer not null default 0 check (rooms >= 0),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index bills_owner_idx on bills (owner_id);
create index bills_place_idx on bills (place_id);
