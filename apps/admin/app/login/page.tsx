'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErr('ログインに失敗しました。メールアドレスとパスワードを確認してください。');
        return;
      }
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: '80px auto' }}>
      <h1>運営ログイン</h1>
      <div className="sub">管理者アカウントでログインしてください。</div>
      <form onSubmit={submit} className="form">
        <div className="field wide">
          <label htmlFor="login-email">メールアドレス</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field wide">
          <label htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {err && <p className="note" role="alert">{err}</p>}
        <div className="form-foot">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'ログイン中…' : 'ログイン'}
          </button>
        </div>
      </form>
      <p className="note">
        ※ 管理者権限は <code>app_metadata.role = &#39;admin&#39;</code> または <code>ADMIN_EMAILS</code> で付与します。
      </p>
    </div>
  );
}
