import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/admin-check';

const mkUser = (over: Partial<User>): User => ({
  id: 'u', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '', ...over,
} as User);

describe('isAdminUser', () => {
  const orig = process.env.ADMIN_EMAILS;
  beforeEach(() => { delete process.env.ADMIN_EMAILS; });
  afterEach(() => { if (orig === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = orig; });

  it('rejects null (fail-closed)', () => {
    expect(isAdminUser(null)).toBe(false);
  });
  it('accepts app_metadata.role === "admin"', () => {
    expect(isAdminUser(mkUser({ app_metadata: { role: 'admin' } }))).toBe(true);
  });
  it('accepts email in ADMIN_EMAILS (case/space-insensitive)', () => {
    process.env.ADMIN_EMAILS = ' Admin@Example.com , ops@x.io ';
    expect(isAdminUser(mkUser({ email: 'admin@example.com' }))).toBe(true);
    expect(isAdminUser(mkUser({ email: 'OPS@X.IO' }))).toBe(true);
  });
  it('rejects email NOT in the allowlist', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    expect(isAdminUser(mkUser({ email: 'intruder@evil.com' }))).toBe(false);
  });
  it('rejects when allowlist is empty and role is not admin (fail-closed)', () => {
    expect(isAdminUser(mkUser({ email: 'someone@example.com', app_metadata: {} }))).toBe(false);
  });
  it('does not treat empty ADMIN_EMAILS entries as a match for empty email', () => {
    process.env.ADMIN_EMAILS = ',, ,';
    expect(isAdminUser(mkUser({ email: '' }))).toBe(false);
  });
});
