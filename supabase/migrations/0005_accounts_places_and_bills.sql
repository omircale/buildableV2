-- Accounts that keep their own work, in folders named after places.
--
-- Three things, none of which touch existing data:
--
-- 1. An invitation list. Sign-up alone still grants nothing; an address the admin has invited becomes
--    a member the moment it is confirmed. Until now the only way to admit a second person was SQL.
-- 2. Places — the folders. A place is a site the account works on: a hotel, a branch, an office floor.
-- 3. Bills — a surveyed project (its rooms, equipment, finishes) saved to the account, in a place or
--    in none.
--
-- The separation between accounts is row-level security on owner_id, and it is strict: a place or a
-- bill is visible to the account that owns it and to nobody else, the admin included. An admin can
-- see who is a member; an admin cannot open a customer's bill.

create table public.invited_emails (
  email text primary key check (email = lower(email) and char_length(email) between 3 and 320),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invited_emails_invited_by_idx on public.invited_emails (invited_by);

alter table public.invited_emails enable row level security;
create policy invited_emails_admin_select on public.invited_emails for select to authenticated using ((select private.is_admin()));
create policy invited_emails_admin_insert on public.invited_emails for insert to authenticated with check ((select private.is_admin()));
create policy invited_emails_admin_delete on public.invited_emails for delete to authenticated using ((select private.is_admin()));

-- A confirmed address that is on the admin bootstrap list becomes the admin (once); one that was
-- invited becomes a member. An unconfirmed address becomes nothing: the mailbox has to be theirs.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if exists (select 1 from public.bootstrap_admin_emails where lower(email) = lower(new.email)) then
    insert into public.app_users (user_id, role) values (new.id, 'admin') on conflict (user_id) do nothing;
    delete from public.bootstrap_admin_emails where lower(email) = lower(new.email);
  elsif exists (select 1 from public.invited_emails where email = lower(new.email)) then
    insert into public.app_users (user_id, role) values (new.id, 'member') on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- Inviting an address whose owner already signed up and confirmed admits them at once.
create or replace function private.admit_invited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_users (user_id, role)
  select u.id, 'member' from auth.users u
  where lower(u.email) = new.email and u.email_confirmed_at is not null
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function private.admit_invited() from public, anon, authenticated;

create trigger invited_emails_admit
  after insert on public.invited_emails
  for each row execute function private.admit_invited();

-- Who the members are, for the admin screen: an address and a role, nothing else about the account.
create or replace function public.admin_members()
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, u.email::text, a.role, a.created_at
  from public.app_users a join auth.users u on u.id = a.user_id
  where (select private.is_admin())
  order by a.created_at;
$$;
revoke execute on function public.admin_members() from public, anon;
grant execute on function public.admin_members() to authenticated;

create table public.places (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index places_owner_idx on public.places (owner_id);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id uuid references public.places (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  -- The project exactly as the app exports it. Five megabytes is far beyond ninety-nine rooms.
  data jsonb not null check (pg_column_size(data) <= 5 * 1024 * 1024),
  rooms integer not null default 0 check (rooms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bills_owner_idx on public.bills (owner_id);
create index bills_place_idx on public.bills (place_id);

alter table public.places enable row level security;
alter table public.bills enable row level security;

create policy places_select on public.places for select to authenticated
  using ((select private.is_member()) and owner_id = (select auth.uid()));
create policy places_insert on public.places for insert to authenticated
  with check ((select private.is_member()) and owner_id = (select auth.uid()));
create policy places_update on public.places for update to authenticated
  using ((select private.is_member()) and owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy places_delete on public.places for delete to authenticated
  using ((select private.is_member()) and owner_id = (select auth.uid()));

-- A bill can only be filed in a place of the same account: the folder check is part of the policy,
-- because a foreign key alone would let one account file into another's folder by guessing its id.
create policy bills_select on public.bills for select to authenticated
  using ((select private.is_member()) and owner_id = (select auth.uid()));
create policy bills_insert on public.bills for insert to authenticated
  with check (
    (select private.is_member())
    and owner_id = (select auth.uid())
    and (place_id is null or exists (select 1 from public.places p where p.id = place_id and p.owner_id = (select auth.uid())))
  );
create policy bills_update on public.bills for update to authenticated
  using ((select private.is_member()) and owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (place_id is null or exists (select 1 from public.places p where p.id = place_id and p.owner_id = (select auth.uid())))
  );
create policy bills_delete on public.bills for delete to authenticated
  using ((select private.is_member()) and owner_id = (select auth.uid()));

revoke all on public.invited_emails, public.places, public.bills from anon;

create trigger places_touch before update on public.places for each row execute function private.touch_updated_at();
create trigger bills_touch before update on public.bills for each row execute function private.touch_updated_at();
