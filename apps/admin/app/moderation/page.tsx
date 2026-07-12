import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, assertUuid, assertEnum } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

type Report = {
  id: string;
  reporter_id: string;
  target_type: 'post' | 'topic' | 'user';
  target_id: string;
  reason: 'spam' | 'inappropriate' | 'harassment' | 'other';
  detail: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at: string | null;
};

const REASON: Record<Report['reason'], string> = {
  spam: 'スパム',
  inappropriate: '不適切',
  harassment: '嫌がらせ',
  other: 'その他',
};
const TARGET: Record<Report['target_type'], string> = { post: '投稿', topic: 'トピック', user: 'ユーザー' };

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 通報への運営対応：moderation_actions に記録し、reports の状態を更新する（ポイント操作なし＝安全）
async function moderate(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const action = assertEnum(formData.get('action'), ['delete', 'warn', 'dismiss'] as const, 'action');
  const target_type = assertEnum(formData.get('target_type'), ['post', 'topic', 'user'] as const, 'target_type');
  const target_id = assertUuid(formData.get('target_id'), 'target_id');

  await getAdminClient().from('moderation_actions').insert({ report_id: id, action, target_type, target_id });
  await getAdminClient()
    .from('reports')
    .update({ status: action === 'dismiss' ? 'dismissed' : 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id);

  revalidatePath('/moderation');
}

export default async function Moderation() {
  await requireAdmin();
  const { data, error } = await getAdminClient()
    .from('reports')
    .select('id,reporter_id,target_type,target_id,reason,detail,status,created_at,resolved_at')
    .order('status', { ascending: true }) // open を先頭に
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <>
        <h1>通報・モデレーション</h1>
        <p className="note">取得に失敗しました（{error.message}）。<code>reports</code> / <code>moderation_actions</code> と SERVICE_ROLE_KEY を確認してください。</p>
      </>
    );
  }
  const rows = (data as Report[]) ?? [];
  const open = rows.filter((r) => r.status === 'open').length;

  return (
    <>
      <h1>通報・モデレーション（未対応 {open} / 直近 {rows.length}）</h1>
      <div className="sub">通報を確認し、対応（削除／警告／却下）を記録します。対応は <code>moderation_actions</code> に残ります。</div>
      <table>
        <thead>
          <tr>
            <th>状態</th><th>対象</th><th>理由</th><th>詳細</th><th>通報日時</th><th className="right">対応</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = r.status === 'open'
              ? <span className="pill warn">未対応</span>
              : r.status === 'resolved'
                ? <span className="pill ok">対応済</span>
                : <span className="pill mute">却下</span>;
            return (
              <tr key={r.id}>
                <td>{st}</td>
                <td><span className="pill blue">{TARGET[r.target_type]}</span> <span className="mono">#{r.target_id.slice(0, 8)}</span></td>
                <td>{REASON[r.reason]}</td>
                <td className="muted">{r.detail ?? '—'}</td>
                <td className="mono">{fmt(r.created_at)}</td>
                <td className="right">
                  {r.status === 'open' ? (
                    <div className="actions" style={{ justifyContent: 'flex-end' }}>
                      <form action={moderate}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="target_type" value={r.target_type} />
                        <input type="hidden" name="target_id" value={r.target_id} />
                        <input type="hidden" name="action" value="delete" />
                        <button className="btn danger" type="submit">削除して対応</button>
                      </form>
                      <form action={moderate}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="target_type" value={r.target_type} />
                        <input type="hidden" name="target_id" value={r.target_id} />
                        <input type="hidden" name="action" value="warn" />
                        <button className="btn warn" type="submit">警告</button>
                      </form>
                      <form action={moderate}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="target_type" value={r.target_type} />
                        <input type="hidden" name="target_id" value={r.target_id} />
                        <input type="hidden" name="action" value="dismiss" />
                        <button className="btn" type="submit">却下</button>
                      </form>
                    </div>
                  ) : (
                    <span className="muted mono">{r.resolved_at ? fmt(r.resolved_at) : '—'}</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>通報はありません</td></tr>
          )}
        </tbody>
      </table>
      <p className="note">※ 凍結／BAN（ユーザー状態変更）は <code>user_moderation_state</code> を扱う運営RPCで別途対応します。</p>
    </>
  );
}
