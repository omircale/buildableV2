import { useEffect, useState } from 'react';
import { supabase, useAuth } from './cloud/supabase';
import { DEFAULT_CONFIG, type EngineeringConfig } from './engine';
import { AdminPage } from './pages/Admin';
import { DesignerPage } from './pages/Designer';
import { LoginPage } from './pages/Login';
import { useDesign } from './state/designStore';

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const route = useHashRoute();
  const auth = useAuth();
  const setConfig = useDesign((s) => s.setConfig);

  useEffect(() => {
    if (!supabase || !auth.role) return;
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'engineering_config')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setConfig({ ...DEFAULT_CONFIG, ...(data.value as Partial<EngineeringConfig>) });
      });
  }, [auth.role, setConfig]);

  if (route.startsWith('#/admin')) return <AdminPage auth={auth} />;
  if (route.startsWith('#/login')) return <LoginPage auth={auth} />;
  return <DesignerPage auth={auth} />;
}
