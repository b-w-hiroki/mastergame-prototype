'use client';

import { FormEvent, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function LoginForm({ initialError = '' }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      router.replace('/');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ログインに失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><span className="logo">MG</span>MasterGame</div>
      <h1>運営コンソール</h1>
      <p className="sub">管理者アカウントでログインしてください。</p>
      <label>メールアドレス</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      <label>パスワード</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      {message && <p className="login-error">{message}</p>}
      <button className="btn primary login-button" type="submit" disabled={busy}>
        {busy ? '確認中…' : 'ログイン'}
      </button>
    </form>
  );
}
