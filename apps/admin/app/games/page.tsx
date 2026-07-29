import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, assertUuid, assertEnum, assertSlug } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

type GameRow = {
  id: string;
  slug: string;
  name: string;
  genre: string;
  description: string | null;
  platforms: string[] | null;
  is_featured: boolean;
  forum_id: string | null;
  followers: number;
  topic_count: number;
  last_activity_at: string | null;
};

const GENRES = ['rpg', 'action', 'puzzle', 'shooter', 'strategy', 'sports', 'sim', 'casual'] as const;
const GENRE_LABEL: Record<string, string> = {
  rpg: 'RPG', action: 'アクション', puzzle: 'パズル', shooter: 'シューター',
  strategy: 'ストラテジー', sports: 'スポーツ', sim: 'シミュレーション', casual: 'カジュアル',
};
const PLATFORMS = ['ios', 'android', 'pc'] as const;

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// タイトルの作成 / 更新。掲示板は games への insert トリガ（0025）が自動で用意する。
async function saveGame(formData: FormData) {
  'use server';
  await requireAdmin();
  const idRaw = String(formData.get('id') ?? '').trim();
  const id = idRaw === '' ? '' : assertUuid(idRaw);

  const name = String(formData.get('name') ?? '').trim();
  if (name === '') throw new Error('name required');
  // slug は掲示板の slug（game-<slug>）にもなるので形式を固定する
  const slug = assertSlug(formData.get('slug'));

  const platforms = PLATFORMS.filter((p) => formData.get(`platform_${p}`) === 'on');

  const payload = {
    name,
    slug,
    genre: assertEnum(formData.get('genre'), GENRES, 'genre'),
    description: String(formData.get('description') ?? '').trim() || null,
    publisher: String(formData.get('publisher') ?? '').trim() || null,
    platforms,
    is_featured: formData.get('is_featured') === 'on',
    is_active: formData.get('is_active') === 'on',
  };

  const db = getAdminClient();
  const { error } = id
    ? await db.from('games').update(payload).eq('id', id)
    : await db.from('games').insert(payload);
  if (error) throw new Error(`games save failed: ${error.message}`);

  revalidatePath('/games');
}

export default async function Games() {
  await requireAdmin();
  const { data, error } = await getAdminClient()
    .from('game_hub_rows')
    .select('*')
    .order('is_featured', { ascending: false })
    .order('name');

  if (error) {
    return (
      <>
        <h1>ゲームタイトル</h1>
        <p className="note">
          取得に失敗しました（{error.message}）。マイグレーション <code>0025_game_hub.sql</code> の適用と
          SERVICE_ROLE_KEY を確認してください。
        </p>
      </>
    );
  }

  const rows = (data as unknown as GameRow[]) ?? [];

  return (
    <>
      <h1>ゲームタイトル（{rows.length}）</h1>
      <div className="sub">
        タイトルを追加すると、<strong>そのタイトルの掲示板が自動で作成されます</strong>（1タイトル1掲示板）。
        ユーザーはタイトルをフォローすると、そのゲームの投稿だけがコミュニティのフィードに流れます。
      </div>

      <details className="editor">
        <summary>＋ タイトルを追加</summary>
        <form className="form" action={saveGame}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="g-name">タイトル名</label>
              <input id="g-name" name="name" type="text" required />
            </div>
            <div className="field">
              <label htmlFor="g-slug">slug（英小文字・数字・ハイフン）</label>
              <input id="g-slug" name="slug" type="text" required placeholder="eldia" />
            </div>
            <div className="field">
              <label htmlFor="g-genre">ジャンル</label>
              <select id="g-genre" name="genre" defaultValue="rpg">
                {GENRES.map((g) => <option key={g} value={g}>{GENRE_LABEL[g]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="g-publisher">パブリッシャー</label>
              <input id="g-publisher" name="publisher" type="text" />
            </div>
            <div className="field wide">
              <label htmlFor="g-desc">説明</label>
              <textarea id="g-desc" name="description" />
            </div>
            <div className="field wide">
              <label>プラットフォーム</label>
              <div className="actions">
                {PLATFORMS.map((p) => (
                  <span key={p} className="field check">
                    <input id={`g-plat-${p}`} name={`platform_${p}`} type="checkbox" />
                    <label htmlFor={`g-plat-${p}`}>{p.toUpperCase()}</label>
                  </span>
                ))}
              </div>
            </div>
            <div className="field check">
              <input id="g-featured" name="is_featured" type="checkbox" />
              <label htmlFor="g-featured">注目タイトルにする</label>
            </div>
            <div className="field check">
              <input id="g-active" name="is_active" type="checkbox" defaultChecked />
              <label htmlFor="g-active">公開する</label>
            </div>
          </div>
          <div className="form-foot">
            <button className="btn primary" type="submit">追加</button>
            <span className="muted" style={{ fontSize: 12 }}>掲示板は自動で作成されます</span>
          </div>
        </form>
      </details>

      <table>
        <thead>
          <tr>
            <th>タイトル</th><th>ジャンル</th><th>プラットフォーム</th>
            <th className="right">フォロー</th><th className="right">投稿</th><th>最終更新</th><th>掲示板</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td>
                {g.is_featured && <span className="pill warn" style={{ marginRight: 6 }}>注目</span>}
                {g.name}
                <div className="mono muted" style={{ fontSize: 11 }}>{g.slug}</div>
              </td>
              <td>{GENRE_LABEL[g.genre] ?? g.genre}</td>
              <td className="mono">{(g.platforms ?? []).map((p) => p.toUpperCase()).join('/') || '—'}</td>
              <td className="right mono">{g.followers}</td>
              <td className="right mono">{g.topic_count}</td>
              <td className="mono muted">{fmt(g.last_activity_at)}</td>
              <td>
                {g.forum_id
                  ? <span className="pill ok">あり</span>
                  : <span className="pill danger">なし</span>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa0ad', padding: 30 }}>タイトルがありません</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
