import { Redirect } from 'expo-router';

/** 既存の交換リンクからも統合済みのポイント画面へ案内する。 */
export default function ExchangeRedirect() {
  return <Redirect href={{ pathname: '/points', params: { section: 'exchange' } }} />;
}
