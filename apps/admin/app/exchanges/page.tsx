import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type RequestRow = {
  id: string;
  user_id: string;
  cost_points: number;
  status: 'processing' | 'fulfilled' | 'cancelled';
  code: string | null;
  requested_at: string;
  fulfilled_at: string | null;
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
}

export default async function Exchanges() {
  await requireAdmin();
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
    </>
  );
}
