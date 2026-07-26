#!/usr/bin/env node
// ============================================================
// MasterGame — Supabase 接続＆設定スモークチェック（依存レス / Node 18+ の fetch を使用）
//
// 実プロジェクトに対して「マイグレーション/権限/seed が正しく入ったか」を検証する。
// セキュリティ不変条件（付与RPCの権限剥奪・管理ビューの遮断）も REST 越しに再確認する。
//
// 使い方:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/check-supabase.mjs
// （SERVICE_ROLE_KEY は任意。あれば service_role 側の確認も行う）
// ============================================================
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON) {
  console.error('✗ SUPABASE_URL / SUPABASE_ANON_KEY が未設定です。');
  console.error('  例: SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=... node scripts/check-supabase.mjs');
  process.exit(2);
}

const base = URL.replace(/\/+$/, '');
let failed = 0;
const results = [];
function record(ok, label, detail = '') {
  results.push({ ok, label, detail });
  if (!ok) failed++;
}

async function req(path, { key, method = 'GET', body } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  // 1) 公開カタログは anon で読めること（RLS: is_active）
  for (const table of ['missions', 'exchange_items', 'vip_tiers']) {
    try {
      const r = await req(`/rest/v1/${table}?select=id&limit=1`, { key: ANON });
      record(r.status === 200, `anon が ${table} を読める`, `status=${r.status}`);
    } catch (e) { record(false, `anon が ${table} を読める`, String(e)); }
  }

  // 2) 付与の内部口 apply_points は anon から実行できないこと（0013 の権限剥奪）
  try {
    const r = await req('/rest/v1/rpc/apply_points', {
      key: ANON, method: 'POST',
      body: { p_user: '00000000-0000-0000-0000-000000000000', p_delta: 1, p_reason: 'x' },
    });
    // 権限なし = 401/403/404（PostgREST は未公開関数を 404 で返すこともある）
    record([401, 403, 404].includes(r.status), 'apply_points が anon から実行不可', `status=${r.status}`);
  } catch (e) { record(false, 'apply_points が anon から実行不可', String(e)); }

  // 3) 管理ビューは anon から読めないこと（0013 の revoke）
  try {
    const r = await req('/rest/v1/admin_user_rows?select=id&limit=1', { key: ANON });
    record([401, 403, 404].includes(r.status), 'admin_user_rows が anon から参照不可', `status=${r.status}`);
  } catch (e) { record(false, 'admin_user_rows が anon から参照不可', String(e)); }

  // 4) service_role がある場合の追加確認
  if (SERVICE) {
    try {
      const r = await req('/rest/v1/admin_overview?select=total_users&limit=1', { key: SERVICE });
      record(r.status === 200, 'service_role が admin_overview を参照可', `status=${r.status}`);
    } catch (e) { record(false, 'service_role が admin_overview を参照可', String(e)); }
    try {
      const r = await req('/rest/v1/ad_partners?select=slug', { key: SERVICE });
      const hasSandbox = Array.isArray(r.json) && r.json.some((p) => p.slug === 'sandbox');
      record(hasSandbox, 'seed の ad_partner(sandbox) が投入済み', hasSandbox ? '' : 'seed 未適用の可能性');
    } catch (e) { record(false, 'seed の ad_partner(sandbox) が投入済み', String(e)); }
  } else {
    console.log('… SUPABASE_SERVICE_ROLE_KEY 未設定のため service_role 側の確認はスキップ');
  }

  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.detail ? `  (${r.detail})` : ''}`);
  }
  console.log(failed === 0 ? '\nすべてのチェックに合格しました。' : `\n${failed} 件のチェックに失敗しました。`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('unexpected error:', e); process.exit(1); });
