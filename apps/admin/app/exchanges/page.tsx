import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, assertUuid } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

type Req = {
  id: string;
  user_id: string;
  item_id: string;
  cost_points: number;
  status: 'processing' | 'fulfilled' | 'cancelled';
  code: string | null;
  requested_at: string;
  fulfilled_at: string | null;
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
  const code = String(formData.get('code') ?? '').trim() || null;
  const { data, error } = await getAdminClient().rpc('fulfill_exchange', { p_request_id: id, p_code: code });
  if (error) throw new Error(error.message);
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error(`fulfill failed: ${(data as { reason?: string }).reason ?? 'unknown'}`);
  }
  revalidatePath('/exchanges');
}

// 交換申請を取消（返金＋在庫戻し）。RPC cancel_exchange（0017）。
async function cancel(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const { data, error } = await getAdminClient().rpc('cancel_exchange', { p_request_id: id, p_reason: 'admin_cancel' });
  if (error) throw new Error(error.message);
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error(`cancel failed: ${(data as { reason?: string }).reason ?? 'unknown'}`);
  }
  revalidatePath('/exchanges');
}

export default async function Exchanges() {
  await requireAdmin();
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
      <p className="note">※ 「完了」は在庫消費済みの申請にコードを付与します。「取消・返金」は消費ポイントを戻し、有限在庫を1つ復元します（RPC は冪等）。</p>
    </>
  );
}
