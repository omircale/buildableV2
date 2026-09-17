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
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ session: null, role: null, loading: cloudConfigured });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const resolve = async (session: Session | null) => {
      let role: Role = null;
      if (session) {
        // RLS lets a user read only their own app_users row.
        const { data } = await supabase.from('app_users').select('role').eq('user_id', session.user.id).maybeSingle();
        role = (data?.role as Role) ?? null;
      }
      if (active) setState({ session, role, loading: false });
    };
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
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
