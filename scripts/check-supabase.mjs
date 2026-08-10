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

  // 4) 未ログインで見せてよいものは読めること（0025 / 0024）
  //    game_hub_rows は 0030 の revoke で一度壊れた実績があるため、実環境で必ず確認する。
  for (const [path, label] of [
    ['game_hub_rows?select=slug&limit=1', 'anon がゲームハブを読める（登録前に見せる面）'],
    ['current_legal_documents?select=slug&limit=1', 'anon が規約類を読める（登録前に確認できる）'],
    ['games?select=slug&limit=1', 'anon がゲーム一覧を読める'],
  ]) {
    try {
      const r = await req(`/rest/v1/${path}`, { key: ANON });
      record(r.status === 200, label, `status=${r.status}`);
    } catch (e) { record(false, label, String(e)); }
  }

  // 5) クライアントに漏れてはいけないもの（0030 / 0031）
  //    粗利構造・不正対策の閾値・生ログ・提携先の鍵参照。RLS だけでなく権限でも塞ぐ。
  const SECRET_TABLES = [
    ['app_config', '運用設定（還元率・原価ミックス・各種上限）'],
    ['fraud_settings', '不正検知の閾値'],
    ['revenue_benchmarks', 'アクション別の収益単価'],
    ['ad_partners', '提携先（署名鍵の参照を含む）'],
    ['app_events', '行動ログの生データ'],
    ['fraud_flags', '不正フラグ'],
    ['user_roles', 'ロール割当'],
  ];
  for (const [table, what] of SECRET_TABLES) {
    try {
      const r = await req(`/rest/v1/${table}?select=*&limit=1`, { key: ANON });
      // 権限が無ければ 401/403、PostgREST のスキーマキャッシュ外なら 404。
      // 200 で空配列＝RLS で絞られている状態も「漏れていない」として許容する。
      const blocked = [401, 403, 404].includes(r.status)
        || (r.status === 200 && Array.isArray(r.json) && r.json.length === 0);
      record(blocked, `anon が ${table} を読めない（${what}）`, `status=${r.status}`);
    } catch (e) { record(false, `anon が ${table} を読めない（${what}）`, String(e)); }
  }

  // 6) 追加した RPC が anon から叩けないこと（0021〜0031）
  const GUARDED_RPCS = [
    ['process_account_deletions', { p_dry_run: true }, '退会の確定処理'],
    ['expire_points', { p_dry_run: true }, 'ポイント失効'],
    ['purge_app_events', { p_dry_run: true }, '行動ログの削除'],
    ['support_user_context', { p_user: '00000000-0000-0000-0000-000000000000' }, 'CS用のユーザー情報'],
    ['answer_inquiry', { p_inquiry_id: '00000000-0000-0000-0000-000000000000', p_body: 'x' }, '運営としての回答'],
    ['resolve_fraud_flag', { p_flag_id: '00000000-0000-0000-0000-000000000000', p_action: 'dismiss' }, '不正フラグの処理'],
    ['check_velocity', { p_user: '00000000-0000-0000-0000-000000000000' }, '速度検知の内部関数'],
    ['raise_fraud_flag', { p_user: '00000000-0000-0000-0000-000000000000', p_type: 'x', p_severity: 'low' }, 'フラグ起票の内部関数'],
    ['ensure_game_forum', { p_game_id: '00000000-0000-0000-0000-000000000000' }, '掲示板の自動生成'],
  ];
  for (const [fn, body, what] of GUARDED_RPCS) {
    try {
      const r = await req(`/rest/v1/rpc/${fn}`, { key: ANON, method: 'POST', body });
      record([401, 403, 404].includes(r.status), `${fn} が anon から実行不可（${what}）`, `status=${r.status}`);
    } catch (e) { record(false, `${fn} が anon から実行不可（${what}）`, String(e)); }
  }

  // 7) 認証が要る RPC は anon だと拒否されること（誤って公開していないか）
  const AUTH_RPCS = [
    ['claim_daily_streak', {}, '連続ログイン'],
    ['my_streak', {}, 'ストリーク照会'],
    ['my_referral_status', {}, '招待コード'],
    ['create_inquiry', { p_category: 'other', p_subject: 'x', p_body: 'x' }, '問い合わせ作成'],
    ['request_account_deletion', {}, '退会申請'],
    ['record_events', { p_events: [] }, 'イベント送信'],
    ['register_device', { p_device_id: 'x' }, '端末登録'],
  ];
  for (const [fn, body, what] of AUTH_RPCS) {
    try {
      const r = await req(`/rest/v1/rpc/${fn}`, { key: ANON, method: 'POST', body });
      // 未ログインなので 401/403（権限なし）か 400/500（not authenticated の raise）
      record(r.status !== 200, `${fn} が未ログインでは通らない（${what}）`, `status=${r.status}`);
    } catch (e) { record(false, `${fn} が未ログインでは通らない（${what}）`, String(e)); }
  }

  // 8) service_role がある場合の追加確認
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

    // 新しいマイグレーション（0021〜0031）が適用されているか。
    // ブラウザ経由セットアップで setup_all.sql が古いと、ここだけ落ちる。
    for (const [path, label] of [
      ['fraud_settings?select=key&limit=1', '0021 不正検知が適用済み'],
      ['admin_economy_summary?select=issued_30d&limit=1', '0022 経済ダッシュボードが適用済み'],
      ['referrals?select=id&limit=1', '0023 招待が適用済み'],
      ['current_legal_documents?select=slug', '0024 法務文書が投入済み'],
      ['game_hub_rows?select=slug&limit=1', '0025 ゲームハブが適用済み'],
      ['account_deletions?select=user_id&limit=1', '0026 退会が適用済み'],
      ['inquiries?select=id&limit=1', '0027 問い合わせが適用済み'],
      ['app_events?select=id&limit=1', '0028 行動計測が適用済み'],
      ['streak_rewards?select=day_index', '0029 ストリークの段階報酬が投入済み'],
    ]) {
      try {
        const r = await req(`/rest/v1/${path}`, { key: SERVICE });
        record(r.status === 200, label, `status=${r.status}`);
      } catch (e) { record(false, label, String(e)); }
    }

    // 法務文書が下書きのまま公開されていないか（〔 〕のプレースホルダ）
    try {
      const r = await req('/rest/v1/current_legal_documents?select=slug,body', { key: SERVICE });
      const drafts = Array.isArray(r.json)
        ? r.json.filter((d) => typeof d.body === 'string' && d.body.includes('〔')).map((d) => d.slug)
        : [];
      record(drafts.length === 0,
        '法務文書に未確定のプレースホルダが残っていない',
        drafts.length ? `要差し替え: ${drafts.join(', ')}（弁護士確認と実値への置換が必要）` : '');
    } catch (e) { record(false, '法務文書のプレースホルダ確認', String(e)); }
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
