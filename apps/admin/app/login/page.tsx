import LoginForm from './login-form';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const initialError = searchParams.error === 'forbidden'
    ? 'このアカウントには管理者権限がありません。'
    : '';
  return <LoginForm initialError={initialError} />;
}
