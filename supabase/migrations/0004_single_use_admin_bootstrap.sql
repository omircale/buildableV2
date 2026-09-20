-- The bootstrap address is a one-time key: once it has granted admin, it is consumed. Without this, the
-- address stays usable forever, so a future sign-up with it (or a re-registration after an account is
-- deleted) would hand out admin again.
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
    delete from public.bootstrap_admin_emails where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;
