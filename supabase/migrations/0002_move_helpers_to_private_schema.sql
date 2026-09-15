-- Keep RLS helper functions off the exposed REST API (Supabase advisor 0029).
-- Policies and triggers reference functions by OID, so moving the schema keeps them wired.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_member() set schema private;
alter function public.is_admin() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.touch_updated_at() set schema private;
revoke all on table public.bootstrap_admin_emails from authenticated;
