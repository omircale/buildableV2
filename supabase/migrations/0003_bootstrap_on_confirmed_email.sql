-- Audit 2 (security). Three fixes, none of which change existing data.
--
-- 1. Admin bootstrap required only the e-mail address, at sign-up time. Before the owner signs up, anyone
--    could register with that address and receive the admin row even without confirming the mailbox.
--    Admin is now granted only once the address is confirmed (at sign-up if it is already confirmed,
--    otherwise at the moment of confirmation).
-- 2. The reporting view was created after the blanket revoke, so the anon role kept grants on it.
-- 3. Advisor warnings: overlapping permissive policies, and a foreign key with no index.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from public.bootstrap_admin_emails where lower(email) = lower(new.email)) then
    insert into public.app_users (user_id, role) values (new.id, 'admin') on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- Fires when an address becomes confirmed (the usual path: sign up, then click the e-mail link).
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_new_user();

revoke all on public.admin_storage_by_user from anon, public;
grant select on public.admin_storage_by_user to authenticated;

-- app_settings / app_users: one policy per action instead of a broad "for all" that also matched SELECT.
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_insert on public.app_settings for insert to authenticated with check ((select private.is_admin()));
create policy app_settings_admin_update on public.app_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy app_settings_admin_delete on public.app_settings for delete to authenticated using ((select private.is_admin()));

drop policy if exists app_users_admin_write on public.app_users;
create policy app_users_admin_insert on public.app_users for insert to authenticated with check ((select private.is_admin()));
create policy app_users_admin_update on public.app_users for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy app_users_admin_delete on public.app_users for delete to authenticated using ((select private.is_admin()));

create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);
