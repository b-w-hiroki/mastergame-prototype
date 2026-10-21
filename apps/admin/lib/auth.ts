import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';

export { isAdminUser };
export { assertUuid, assertEnum, assertSlug } from '@/lib/validate';

// Server actions and pages must check again after the proxy gate.
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !isAdminUser(user)) redirect('/login');
  return user!;
}
