import { useSyncExternalStore } from 'react';
import { Alert as NativeAlert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AlertButton, AlertOptions } from 'react-native';
import { colors } from '@/lib/theme';

type Notice = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
let queue: Notice[] = [];
let generation = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => queue[0] ?? null;

/** アカウント変更時に古いWebダイアログと確認コールバックを無効化する。 */
export function clearAppAlerts() {
  generation += 1;
  queue = [];
  notify();
}

/** RN Web の Alert は未実装のため、Web はアプリ内の確認モーダルを使う。 */
export const AppAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    const noticeGeneration = generation;
    let settled = false;
    const safeButtons = (buttons?.length ? buttons : [{ text: 'OK' }]).map((button) => ({
      ...button,
      onPress: () => {
        if (settled || noticeGeneration !== generation) return;
        settled = true;
        try {
          Promise.resolve(button.onPress?.()).catch(() => {
            if (noticeGeneration !== generation) return;
            AppAlert.alert('処理を完了できませんでした', '通信環境を確認してください。変更を送信した場合は、結果を確認してから再試行してください。');
          });
        } catch {
          if (noticeGeneration !== generation) return;
          AppAlert.alert('処理を完了できませんでした', '通信環境を確認して再試行してください。');
        }
      },
    }));
    if (Platform.OS !== 'web') {
      if (!buttons && !options) {
        if (message === undefined) NativeAlert.alert(title);
        else NativeAlert.alert(title, message);
      } else NativeAlert.alert(title, message, buttons ? safeButtons : undefined, options);
      return;
    }
    queue = [...queue, { title, message, buttons: safeButtons, options }];
    notify();
  },
};

export function AppAlertHost() {
  const notice = useSyncExternalStore(subscribe, snapshot, () => null);
  function dismiss(expected: Notice) {
    if (queue[0] !== expected) return false;
    queue = queue.slice(1);
    notify();
    return true;
  }
  return <Modal transparent visible={!!notice} animationType="fade" onRequestClose={() => {
    if (notice?.options?.cancelable && dismiss(notice)) notice.options.onDismiss?.();
  }}>
    {notice && <View style={s.overlay}>
      <View style={s.card} accessibilityViewIsModal accessibilityLabel={notice.title}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={s.title}>{notice.title}</Text>
          {!!notice.message && <Text style={s.message}>{notice.message}</Text>}
          {notice.buttons.map((button, index) => <Pressable key={index} accessibilityRole="button"
            style={s.button} onPress={() => { if (dismiss(notice)) button.onPress?.(); }}>
            <Text style={[s.buttonText, button.style === 'destructive' && s.destructive]}>{button.text ?? 'OK'}</Text>
          </Pressable>)}
        </ScrollView>
      </View>
    </View>}
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, maxHeight: '85%', backgroundColor: colors.paper, borderRadius: 16, padding: 22 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  message: { fontSize: 14, lineHeight: 22, color: colors.sub, marginTop: 12 },
  button: { padding: 14, marginTop: 10, borderWidth: 1, borderColor: colors.line2, borderRadius: 10 },
  buttonText: { color: colors.accent, fontWeight: '800', textAlign: 'center' },
  destructive: { color: colors.danger },
});
