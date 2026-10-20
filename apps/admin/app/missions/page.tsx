import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, assertUuid, assertEnum } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { readMissionForm, toJapanInput } from '@/lib/master-data';

export const dynamic = 'force-dynamic';

type Mission = {
  id: string;
  type: 'daily' | 'weekly' | 'achievement' | 'event' | 'offer';
  title: string;
  description: string | null;
  reward_points: number;
  max_progress: number;
  requires_verification: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

const TYPE: Record<Mission['type'], [string, string]> = {
  daily: ['blue', 'デイリー'],
  weekly: ['blue', 'ウィークリー'],
  achievement: ['ok', '実績'],
  event: ['warn', '期間限定'],
  offer: ['mute', '提携オファー'],
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  return toJapanInput(iso).slice(0, 10);
};

// 作成 / 更新（マスタ。ポイント操作なし＝安全。service_role でRLSバイパス）
async function saveMission(formData: FormData) {
  'use server';
  await requireAdmin();
  const idRaw = String(formData.get('id') ?? '').trim();
  const id = idRaw === '' ? '' : assertUuid(idRaw);
  const payload = readMissionForm(formData);

  const res = id
    ? await getAdminClient().from('missions').update(payload).eq('id', id)
    : await getAdminClient().from('missions').insert(payload);
  if (res.error) throw new Error(res.error.message);

  revalidatePath('/missions');
}

async function toggleMission(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const next = assertEnum(formData.get('next'), ['true', 'false'] as const, 'next') === 'true';
  const { error } = await getAdminClient().from('missions').update({ is_active: next }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/missions');
}

async function deleteMission(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = assertUuid(formData.get('id'));
  const { error } = await getAdminClient().from('missions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/missions');
}

function MissionForm({ m }: { m?: Mission }) {
  return (
    <form action={saveMission} className="form">
      {m && <input type="hidden" name="id" value={m.id} />}
      <div className="form-grid">
        <div className="field">
          <label>タイプ</label>
          <select name="type" defaultValue={m?.type ?? 'daily'}>
            <option value="daily">デイリー</option>
            <option value="weekly">ウィークリー</option>
            <option value="achievement">実績</option>
            <option value="event">期間限定</option>
            <option value="offer">提携オファー</option>
          </select>
        </div>
        <div className="field wide">
          <label>タイトル</label>
          <input type="text" name="title" defaultValue={m?.title ?? ''} maxLength={120} required />
        </div>
        <div className="field wide">
          <label>説明（任意）</label>
          <textarea name="description" defaultValue={m?.description ?? ''} />
        </div>
        <div className="field">
          <label>報酬ポイント</label>
          <input type="number" name="reward_points" defaultValue={m?.reward_points ?? 100} min={1} max={2_147_483_647} step={1} required />
        </div>
        <div className="field">
          <label>進捗（max_progress）</label>
          <input type="number" name="max_progress" defaultValue={m?.max_progress ?? 1} min={1} max={2_147_483_647} step={1} />
        </div>
        <div className="field">
          <label>開始（日本時間・任意）</label>
          <input type="datetime-local" name="starts_at" defaultValue={toJapanInput(m?.starts_at ?? null)} />
        </div>
        <div className="field">
          <label>終了（日本時間・任意）</label>
          <input type="datetime-local" name="ends_at" defaultValue={toJapanInput(m?.ends_at ?? null)} />
        </div>
        <div className="field check">
          <input type="checkbox" id={`rv-${m?.id ?? 'new'}`} name="requires_verification" defaultChecked={m?.requires_verification ?? false} />
          <label htmlFor={`rv-${m?.id ?? 'new'}`}>postback検証が必要</label>
        </div>
        <div className="field check">
          <input type="checkbox" id={`ia-${m?.id ?? 'new'}`} name="is_active" defaultChecked={m?.is_active ?? true} />
          <label htmlFor={`ia-${m?.id ?? 'new'}`}>稼働中にする</label>
        </div>
      </div>
      <div className="form-foot">
        <button className="btn primary" type="submit">{m ? '更新する' : '作成する'}</button>
      </div>
    </form>
  );
}

export default async function Missions() {
  await requireAdmin();
  const { data, error } = await getAdminClient()
    .from('missions')
    .select('id,type,title,description,reward_points,max_progress,requires_verification,is_active,starts_at,ends_at,created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <>
        <h1>ミッション管理</h1>
        <p className="note">取得に失敗しました（{error.message}）。<code>missions</code> テーブルと SERVICE_ROLE_KEY を確認してください。</p>
      </>
    );
  }
  const rows = (data as Mission[]) ?? [];
  const active = rows.filter((m) => m.is_active).length;

  return (
    <>
      <h1>ミッション管理（{rows.length} 件 / 稼働 {active}）</h1>
      <div className="sub">配信中のミッション一覧（マスタ）。提携オファーは達成のサーバー検証（postback）後に付与されます。</div>

      <details className="editor">
        <summary>＋ 新しいミッションを作成</summary>
        <MissionForm />
      </details>

      <table>
        <thead>
          <tr>
            <th>タイプ</th><th>タイトル</th><th className="right">報酬P</th><th className="right">進捗</th>
            <th>検証</th><th>状態</th><th>期間</th><th className="right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const t = TYPE[m.type] ?? TYPE.daily;
            return (
              <tr key={m.id}>
                <td><span className={`pill ${t[0]}`}>{t[1]}</span></td>
                <td>
                  <details className="editor" style={{ margin: 0, border: 0, background: 'transparent' }}>
                    <summary style={{ padding: 0, color: 'var(--ink)', fontWeight: 600 }}>{m.title}</summary>
                    <MissionForm m={m} />
                  </details>
                </td>
                <td className="right"><b>{m.reward_points.toLocaleString()}</b> P</td>
                <td className="right">{m.max_progress}</td>
                <td>{m.requires_verification ? <span className="pill blue">postback</span> : <span className="muted">—</span>}</td>
                <td>{m.is_active ? <span className="pill ok">● 稼働</span> : <span className="pill mute">停止</span>}</td>
                <td className="mono">{fmtDate(m.starts_at)} 〜 {fmtDate(m.ends_at)}</td>
                <td className="right">
                  <div className="actions" style={{ justifyContent: 'flex-end' }}>
                    <form action={toggleMission}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="next" value={(!m.is_active).toString()} />
                      <button className={`btn ${m.is_active ? 'warn' : ''}`} type="submit">{m.is_active ? '停止' : '稼働'}</button>
                    </form>
                    <form action={deleteMission}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="btn danger" type="submit">削除</button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>ミッションがまだ登録されていません</td></tr>
          )}
        </tbody>
      </table>
      <p className="note">※ タイトルをクリックすると編集できます。マスタ更新（ポイント操作なし）は service_role 経由で即時反映されます。</p>
    </>
  );
}
