-- Signing in with an address and a password, beside Google.
--
-- Nobody chooses a password on their own: the admin hands a person a one-time link (an invitation, or a
-- reset), and the person sets the password through it. That is what proves the address is theirs, since
-- the site sends no e-mail. Only a hash of the link's token is kept, as with sessions.
alter table users add column password_hash text;
alter table users add column failed_logins integer not null default 0;
alter table users add column locked_until text;

create table password_links (
  token_hash text primary key,
  email text not null,
  purpose text not null check (purpose in ('invite', 'reset')),
  created_by text references users (id) on delete set null,
  expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index password_links_email_idx on password_links (email);
