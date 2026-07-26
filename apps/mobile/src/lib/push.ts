import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// フォアグラウンドでも通知バナーを表示する
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function platformTag(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
}

/**
 * 権限を要求し、Expo push token を取得して register_push_token RPC で保存する。
 * 実機のみ（シミュレータ/権限拒否/未ログインでは null を返す）。
 * 例外は握りつぶさず呼び出し側で .catch すること。
 */
export async function registerPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') return null;

  // EAS の projectId（app.json の extra.eas.projectId）。無い場合もあるので任意で渡す。
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = tokenResp.data;

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;

  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: platformTag() });
  if (error) throw error;
  return token;
}

/** ログアウト時などに自端末のトークンを解除する。 */
export async function unregisterPushToken(token: string): Promise<void> {
  await supabase.rpc('remove_push_token', { p_token: token });
}
