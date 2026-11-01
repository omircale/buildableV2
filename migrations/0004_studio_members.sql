-- A studio project shared with the team: the project manager, the contractor, the trades, a consultant.
--
-- The owner adds people by address, so someone invited but not yet signed in can be added too. `access`
-- is what they may do — edit, or only look — and `title` is how the team knows them; it grants nothing.
-- Only the owner adds, removes or deletes the project; anyone may leave a project shared with them.
create table studio_members (
  project_id text not null references studio_projects (id) on delete cascade,
  email text not null,
  access text not null check (access in ('edit', 'view')),
  title text check (title is null or length(title) between 1 and 60),
  added_by text references users (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (project_id, email)
);
create index studio_members_email_idx on studio_members (email);
