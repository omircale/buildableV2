import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ENGINE_VERSION, type DesignParams, type ValidationReport } from '../engine';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const cloudConfigured = Boolean(url && key);
export const supabase = cloudConfigured ? createClient(url!, key!) : null;

export type Role = 'admin' | 'member' | null;

export interface AuthState {
  session: Session | null;
  role: Role;
  loading: boolean;
  /** True when the person arrived from a "reset my password" e-mail and has to choose a new one. */
  recovery: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ session: null, role: null, loading: cloudConfigured, recovery: false });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let recovery = false;
    const resolve = async (session: Session | null) => {
      let role: Role = null;
      if (session) {
        // RLS lets a user read only their own app_users row.
        const { data } = await supabase.from('app_users').select('role').eq('user_id', session.user.id).maybeSingle();
        role = (data?.role as Role) ?? null;
      }
      if (!session) recovery = false;
      if (active) setState({ session, role, loading: false, recovery });
    };
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      if (event === 'USER_UPDATED') recovery = false;
      void resolve(session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

function client() {
  if (!supabase) throw new Error('הענן לא מוגדר');
  return supabase;
}

export interface ProjectRow {
  id: string;
  name: string;
  owner_id: string;
  updated_at: string;
  created_at: string;
}

export interface VersionRow {
  id: string;
  project_id: string;
  version_no: number;
  label: string | null;
  params: DesignParams;
  engine_version: string;
  summary: { overall?: string; coverage?: Record<string, string> };
  created_at: string;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await client().from('projects').select('id,name,owner_id,updated_at,created_at').order('updated_at', { ascending: false });
  if (error) throw error;
  return data as ProjectRow[];
}

export async function createProject(name: string): Promise<ProjectRow> {
  const { data, error } = await client().from('projects').insert({ name }).select('id,name,owner_id,updated_at,created_at').single();
  if (error) throw error;
  await logUsage('project_created', 0);
  return data as ProjectRow;
}

export async function listVersions(projectId: string): Promise<VersionRow[]> {
  const { data, error } = await client().from('project_versions').select('*').eq('project_id', projectId).order('version_no', { ascending: false });
  if (error) throw error;
  return data as VersionRow[];
}

export async function saveVersion(projectId: string, params: DesignParams, report: ValidationReport, label: string | null): Promise<VersionRow> {
  const c = client();
  const { data: last } = await c.from('project_versions').select('version_no').eq('project_id', projectId).order('version_no', { ascending: false }).limit(1).maybeSingle();
  const summary = { overall: report.overall, coverage: report.coverage };
  const row = { project_id: projectId, version_no: (last?.version_no ?? 0) + 1, label, params, engine_version: ENGINE_VERSION, summary };
  const { data, error } = await c.from('project_versions').insert(row).select('*').single();
  if (error) throw error;
  await c.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
  await logUsage('version_saved', new Blob([JSON.stringify(row)]).size);
  return data as VersionRow;
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  const { error } = await client().from('projects').update({ name }).eq('id', projectId);
  if (error) throw error;
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await client().from('projects').delete().eq('id', projectId);
  if (error) throw error;
}

export async function logUsage(kind: 'version_saved' | 'export_csv' | 'export_print' | 'project_created', bytes: number): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  // Usage logging must never break the user flow.
  await supabase.from('usage_events').insert({ kind, bytes }).then(
    () => undefined,
    () => undefined,
  );
}

/** A folder: a site the account works on — a hotel, a branch, an office floor. */
export interface PlaceRow {
  id: string;
  name: string;
  updated_at: string;
}

/** A surveyed project saved to the account. `data` is the project exactly as the app exports it. */
export interface BillRow {
  id: string;
  place_id: string | null;
  name: string;
  rooms: number;
  updated_at: string;
}

const BILL_COLUMNS = 'id,place_id,name,rooms,updated_at';

export async function listPlaces(): Promise<PlaceRow[]> {
  const { data, error } = await client().from('places').select('id,name,updated_at').order('name');
  if (error) throw error;
  return data as PlaceRow[];
}

export async function createPlace(name: string): Promise<PlaceRow> {
  const { data, error } = await client().from('places').insert({ name }).select('id,name,updated_at').single();
  if (error) throw error;
  return data as PlaceRow;
}

export async function renamePlace(id: string, name: string): Promise<void> {
  const { error } = await client().from('places').update({ name }).eq('id', id);
  if (error) throw error;
}

/** Removes the folder. What was filed in it is kept, and shows under "no place". */
export async function deletePlace(id: string): Promise<void> {
  const { error } = await client().from('places').delete().eq('id', id);
  if (error) throw error;
}

export async function listBills(): Promise<BillRow[]> {
  const { data, error } = await client().from('bills').select(BILL_COLUMNS).order('updated_at', { ascending: false });
  if (error) throw error;
  return data as BillRow[];
}

export async function createBill(input: { name: string; placeId: string | null; data: unknown; rooms: number }): Promise<BillRow> {
  const { data, error } = await client().from('bills').insert({ name: input.name, place_id: input.placeId, data: input.data, rooms: input.rooms }).select(BILL_COLUMNS).single();
  if (error) throw error;
  return data as BillRow;
}

export async function updateBill(id: string, patch: { name?: string; placeId?: string | null; data?: unknown; rooms?: number }): Promise<BillRow> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.placeId !== undefined) row.place_id = patch.placeId;
  if (patch.data !== undefined) row.data = patch.data;
  if (patch.rooms !== undefined) row.rooms = patch.rooms;
  // A row that is not this account's is simply not there: the update matches nothing and says so.
  const { data, error } = await client().from('bills').update(row).eq('id', id).select(BILL_COLUMNS).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('not_found');
  return data as BillRow;
}

export async function loadBill(id: string): Promise<{ row: BillRow; data: unknown } | null> {
  const { data, error } = await client().from('bills').select(`${BILL_COLUMNS},data`).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: project, ...row } = data as BillRow & { data: unknown };
  return { row, data: project };
}

export async function deleteBill(id: string): Promise<void> {
  const { error } = await client().from('bills').delete().eq('id', id);
  if (error) throw error;
}

export interface MemberRow {
  user_id: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
}

export async function listMembers(): Promise<MemberRow[]> {
  const { data, error } = await client().rpc('admin_members');
  if (error) throw error;
  return data as MemberRow[];
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await client().from('app_users').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function listInvited(): Promise<{ email: string; created_at: string }[]> {
  const { data, error } = await client().from('invited_emails').select('email,created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data as { email: string; created_at: string }[];
}

export async function invite(email: string): Promise<void> {
  const { error } = await client().from('invited_emails').insert({ email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function uninvite(email: string): Promise<void> {
  const { error } = await client().from('invited_emails').delete().eq('email', email);
  if (error) throw error;
}
