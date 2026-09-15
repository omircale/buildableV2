-- Buildable core schema. Every table has RLS enabled; access requires membership in app_users.
-- Sign-up alone grants nothing: a user without an app_users row can read or write no data.

create table public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table public.bootstrap_admin_emails (
  email text primary key
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_users where user_id = (select auth.uid()));
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_users where user_id = (select auth.uid()) and role = 'admin');
$$;

-- Grants admin automatically when an allow-listed email signs up (single-owner bootstrap).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.bootstrap_admin_emails where lower(email) = lower(new.email)) then
    insert into public.app_users (user_id, role) values (new.id, 'admin') on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  template text not null default 'open_shelf',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id);

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version_no integer not null,
  label text check (label is null or char_length(label) <= 200),
  params jsonb not null,
  engine_version text not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version_no)
);
create index project_versions_project_idx on public.project_versions (project_id);
create index project_versions_owner_idx on public.project_versions (owner_id);

create table public.custom_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index custom_materials_owner_idx on public.custom_materials (owner_id);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('version_saved', 'export_csv', 'export_print', 'project_created')),
  bytes integer not null default 0 check (bytes >= 0),
  created_at timestamptz not null default now()
);
create index usage_events_user_idx on public.usage_events (user_id);

alter table public.app_users enable row level security;
alter table public.bootstrap_admin_emails enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.custom_materials enable row level security;
alter table public.app_settings enable row level security;
alter table public.usage_events enable row level security;

-- app_users: users can see their own row; admins manage all.
create policy app_users_select on public.app_users for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy app_users_admin_write on public.app_users for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- bootstrap_admin_emails: no client access at all (no policies).

-- projects
create policy projects_select on public.projects for select to authenticated
  using ((select public.is_member()) and (owner_id = (select auth.uid()) or (select public.is_admin())));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select public.is_member()) and owner_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using ((select public.is_member()) and owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy projects_delete on public.projects for delete to authenticated
  using ((select public.is_member()) and owner_id = (select auth.uid()));

-- project_versions are append-only history: no update policy.
create policy versions_select on public.project_versions for select to authenticated
  using ((select public.is_member()) and (owner_id = (select auth.uid()) or (select public.is_admin())));
create policy versions_insert on public.project_versions for insert to authenticated
  with check (
    (select public.is_member())
    and owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );
create policy versions_delete on public.project_versions for delete to authenticated
  using ((select public.is_member()) and owner_id = (select auth.uid()));

-- custom_materials: owners manage their own; only admins may mark verified.
create policy custom_materials_select on public.custom_materials for select to authenticated
  using ((select public.is_member()) and (owner_id = (select auth.uid()) or (select public.is_admin())));
create policy custom_materials_insert on public.custom_materials for insert to authenticated
  with check ((select public.is_member()) and owner_id = (select auth.uid()) and (verified = false or (select public.is_admin())));
create policy custom_materials_update on public.custom_materials for update to authenticated
  using ((select public.is_member()) and (owner_id = (select auth.uid()) or (select public.is_admin())))
  with check (verified = false or (select public.is_admin()));
create policy custom_materials_delete on public.custom_materials for delete to authenticated
  using ((select public.is_member()) and (owner_id = (select auth.uid()) or (select public.is_admin())));

-- app_settings: members read, admins write.
create policy app_settings_select on public.app_settings for select to authenticated
  using ((select public.is_member()));
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- usage_events: members insert their own; admins read all (cost dashboard).
create policy usage_insert on public.usage_events for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy usage_select on public.usage_events for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Keep anonymous role out entirely and revoke function execution from public.
revoke all on all tables in schema public from anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_admin() to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger custom_materials_touch before update on public.custom_materials for each row execute function public.touch_updated_at();

-- Storage footprint per user (bytes of saved JSON) for the admin cost view.
create or replace view public.admin_storage_by_user
with (security_invoker = true)
as
select
  v.owner_id as user_id,
  count(distinct v.project_id) as projects,
  count(*) as versions,
  coalesce(sum(pg_column_size(v.params) + pg_column_size(v.summary)), 0)::bigint as bytes
from public.project_versions v
group by v.owner_id;

insert into public.bootstrap_admin_emails (email) values ('orenmindcet@gmail.com');
