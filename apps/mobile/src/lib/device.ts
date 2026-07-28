import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const KEY = 'mg.device_id';

/**
 * 端末識別子を返す（無ければ生成して永続化）。
 *
 * 位置づけ: これは「証拠」ではなく不正検知の「シグナル」。クライアント申告値であり、
 * 再インストールでリセットされる。それでも「同じ端末でアカウントを作り直して
 * 初回ボーナスを取り直す」というポイ活で最も多い不正パターンには十分効く。
 * 端末の真正性を厳密に取るなら DeviceCheck(iOS) / Play Integrity(Android) の
 * アテステーションが要る（本番強化の次段）。
 */
export async function getDeviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(KEY);
  if (saved) return saved;
  const id = randomId();
  await AsyncStorage.setItem(KEY, id);
  return id;
}

/** crypto.getRandomValues（react-native-get-random-values で polyfill 済み）ベースの UUID v4。 */
function randomId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function platformTag(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
}

/**
 * 端末をサーバに登録する。多重アカウント/エミュレータ検知はサーバ側で走る。
 * ログイン後に呼ぶ。未ログインなら何もしない。
 */
export async function registerDevice(): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;

  const deviceId = await getDeviceId();
  const { error } = await supabase.rpc('register_device', {
    p_device_id: deviceId,
    p_platform: platformTag(),
    p_model: Device.modelName ?? null,
    p_os_version: Device.osVersion ?? null,
    // Device.isDevice が false ＝ シミュレータ/エミュレータ
    p_is_emulator: Device.isDevice === false,
  });
  if (error) throw error;
}
