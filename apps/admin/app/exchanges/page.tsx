<<<<<<< HEAD
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, assertUuid } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { assertExchangeResult, fulfillmentCode } from '@/lib/exchange-actions';

export const dynamic = 'force-dynamic';

type Req = {
  id: string;
  user_id: string;
  item_id: string;
=======
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type RequestRow = {
  id: string;
  user_id: string;
>>>>>>> codex/mvp-stabilization-20260919
  cost_points: number;
  status: 'processing' | 'fulfilled' | 'cancelled';
  code: string | null;
  requested_at: string;
  fulfilled_at: string | null;
<<<<<<< HEAD
};

const ST: Record<Req['status'], [string, string]> = {
  processing: ['warn', '処理中'],
  fulfilled: ['ok', '完了'],
  cancelled: ['mute', '取消'],
};

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 交換申請を確定（コード付与）。RPC fulfill_exchange（0017）を service_role で呼ぶ。
async function fulfill(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const db = getAdminClient();
  const { data: request, error: requestError } = await db.from('exchange_requests')
    .select('item_id,status').eq('id', id).single();
  if (requestError || !request || request.status !== 'processing') throw new Error('exchange request is not processing');
  const { data: item, error: itemError } = await db.from('exchange_items')
    .select('delivery_method').eq('id', request.item_id).single();
  if (itemError || !item) throw new Error('exchange item not found');
  const code = fulfillmentCode(formData.get('code'), item.delivery_method);
  const { data, error } = await db.rpc('fulfill_exchange', { p_request_id: id, p_code: code });
  if (error) throw new Error(error.message);
  assertExchangeResult(data, 'fulfill');
  revalidatePath('/exchanges');
}

// 交換申請を取消（返金＋在庫戻し）。RPC cancel_exchange（0017）。
async function cancel(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const { data, error } = await getAdminClient().rpc('cancel_exchange', { p_request_id: id, p_reason: 'admin_cancel' });
  if (error) throw new Error(error.message);
  assertExchangeResult(data, 'cancel');
  revalidatePath('/exchanges');
=======
  exchange_items: { name: string; delivery_method: 'csv' | 'code' | 'api' } | null;
};

const fmt = (iso: string) => new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tokyo',
}).format(new Date(iso));

async function processRequest(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id'));
  const action = String(formData.get('action'));
  const code = String(formData.get('code') ?? '').trim() || null;
  if (action !== 'fulfilled' && action !== 'cancelled') throw new Error('invalid action');

  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc('process_exchange_request', {
    p_request_id: id,
    p_action: action,
    p_code: code,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/exchanges');
  revalidatePath('/');
>>>>>>> codex/mvp-stabilization-20260919
}

export default async function Exchanges() {
  await requireAdmin();
<<<<<<< HEAD
  const { data, error } = await getAdminClient()
    .from('exchange_requests')
    .select('id,user_id,item_id,cost_points,status,code,requested_at,fulfilled_at')
    .order('requested_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <>
        <h1>交換申請</h1>
        <p className="note">取得に失敗しました（{error.message}）。<code>exchange_requests</code> と SERVICE_ROLE_KEY を確認してください。</p>
      </>
    );
  }
  const rows = (data as Req[]) ?? [];
  const processing = rows.filter((r) => r.status === 'processing').length;

  return (
    <>
      <h1>交換申請（処理中 {processing} / 直近 {rows.length}）</h1>
      <div className="sub">ポイント交換の申請一覧。処理中のものにコードを付与して「完了」、または取消（返金＋在庫戻し）します。</div>
      <table>
        <thead>
          <tr>
            <th>状態</th><th>ユーザー</th><th className="right">消費P</th><th>コード</th>
            <th>申請日時</th><th>完了日時</th><th className="right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = ST[r.status] ?? ST.processing;
            return (
              <tr key={r.id}>
                <td><span className={`pill ${st[0]}`}>{st[1]}</span></td>
                <td className="mono">#{r.user_id.slice(0, 8)}</td>
                <td className="right"><b>{r.cost_points.toLocaleString()}</b> P</td>
                <td className="mono">{r.code ?? '—'}</td>
                <td className="mono">{fmt(r.requested_at)}</td>
                <td className="mono">{fmt(r.fulfilled_at)}</td>
                <td className="right">
                  {r.status === 'processing' ? (
                    <div className="actions" style={{ justifyContent: 'flex-end' }}>
                      <form action={fulfill} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="text" name="code" placeholder="コード（任意）" maxLength={64} />
                        <button className="btn primary" type="submit">完了</button>
                      </form>
                      <form action={cancel}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn danger" type="submit">取消・返金</button>
                      </form>
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>交換申請はまだありません</td></tr>
          )}
        </tbody>
      </table>
<<<<<<< HEAD
      <p className="note">※ 「完了」は在庫消費済みの申請にコードを付与します。「取消・返金」は消費ポイントを戻し、有限在庫を1つ復元します（RPC は冪等）。</p>
=======
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('exchange_requests')
    .select('id,user_id,cost_points,status,code,requested_at,fulfilled_at,exchange_items(name,delivery_method)')
    .order('requested_at', { ascending: false })
    .limit(100);

  const rows = (data as unknown as RequestRow[]) ?? [];
  const pending = rows.filter((row) => row.status === 'processing').length;

  return (
    <>
      <h1>交換申請（処理待ち {pending} / 直近 {rows.length}）</h1>
      <div className="sub">申請を確認して受け渡し完了、または取消・ポイント返還を行います。</div>
      {error ? <p className="note">取得に失敗しました（{error.message}）。</p> : (
        <table>
          <thead><tr><th>状態</th><th>アイテム</th><th>ユーザー</th><th className="right">使用P</th><th>申請日時</th><th>処理</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><span className={`pill ${row.status === 'fulfilled' ? 'ok' : row.status === 'cancelled' ? 'danger' : 'warn'}`}>{row.status}</span></td>
                <td>{row.exchange_items?.name ?? '—'}<br /><span className="muted">{row.exchange_items?.delivery_method ?? ''}</span></td>
                <td className="mono">#{row.user_id.slice(0, 8)}</td>
                <td className="right"><b>{row.cost_points.toLocaleString()}</b> P</td>
                <td className="mono">{fmt(row.requested_at)}</td>
                <td>
                  {row.status === 'processing' ? (
                    <div className="actions">
                      <form action={processRequest} className="exchange-action">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="action" value="fulfilled" />
                        <input type="text" name="code" placeholder="受け渡しコード（任意）" />
                        <button className="btn primary" type="submit">完了</button>
                      </form>
                      <form action={processRequest}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="action" value="cancelled" />
                        <button className="btn danger" type="submit">取消・返還</button>
                      </form>
                    </div>
                  ) : <span className="muted">{row.fulfilled_at ? fmt(row.fulfilled_at) : '—'}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>交換申請はありません</td></tr>}
          </tbody>
        </table>
      )}
      <p className="note">取消時はポイントと有限在庫を同一トランザクション内で返還します。処理済み申請への再操作は冪等です。</p>
>>>>>>> codex/mvp-stabilization-20260919
=======
        <p className="note">※ コード配布の商品はコード入力が必須です。「完了」は在庫消費済みの申請を確定します。「取消・返金」は消費ポイントを戻し、有限在庫を1つ復元します（RPC は処理中の申請にだけ適用）。</p>
>>>>>>> codex/points-exchange-ux
    </>
  );
}
