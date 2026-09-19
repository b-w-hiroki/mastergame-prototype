import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: allowed, error } = await supabase.rpc('is_admin');
  if (error || !allowed) redirect('/login?error=forbidden');
  return user;
}
