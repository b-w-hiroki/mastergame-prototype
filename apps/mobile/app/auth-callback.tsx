import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '@/lib/theme';

// Web の OAuth ポップアップを元の画面へ返す。code の交換は呼出元 auth.ts が行う。
WebBrowser.maybeCompleteAuthSession();

export default function AuthCallback() {
  return <SafeAreaView style={s.root}>
    <Text style={s.title}>ログイン元の画面へお戻りください</Text>
    <Text style={s.note}>この画面が自動で閉じない場合は、ログインを開始した画面で結果をご確認ください。直接この画面を開いた場合は、ログインからやり直してください。</Text>
    <Link href="/login" style={s.link}>ログインへ戻る</Link>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  title: { fontSize: 20, color: colors.ink, fontWeight: '800', marginBottom: 16 },
  note: { color: colors.sub, lineHeight: 24 },
  link: { color: colors.accent, fontWeight: '700', marginTop: 20 },
});
