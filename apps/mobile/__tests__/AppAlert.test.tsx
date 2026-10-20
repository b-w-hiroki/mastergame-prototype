import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { AppAlert, AppAlertHost, clearAppAlerts } from '@/components/AppAlert';

describe('AppAlert', () => {
  afterEach(() => { act(() => clearAppAlerts()); jest.restoreAllMocks(); });
  it('ネイティブでは従来のアラートを使う', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    AppAlert.alert('入力してください');
    expect(native).toHaveBeenCalledWith('入力してください');
  });
  it('Web では確認するまで変更処理を呼ばず、キャンセルできる', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const confirm = jest.fn();
    render(<AppAlertHost />);
    act(() => AppAlert.alert('退会の確認', 'ポイントが失効します', [
      { text: 'キャンセル', style: 'cancel' }, { text: '退会する', style: 'destructive', onPress: confirm },
    ]));
    expect(screen.getByText('ポイントが失効します')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('キャンセル'));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByText('退会の確認')).toBeNull();
  });
  it('確認ボタンで一度だけ処理し、後続の案内も表示する', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const confirm = jest.fn(() => AppAlert.alert('完了'));
    render(<AppAlertHost />);
    act(() => AppAlert.alert('確認', undefined, [{ text: '実行', onPress: confirm }]));
    fireEvent.press(screen.getByText('実行'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText('完了')).toBeTruthy();
    fireEvent.press(screen.getByText('OK'));
    expect(screen.queryByText('完了')).toBeNull();
  });
  it('通報理由のような複数の選択肢を表示できる', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const reason = jest.fn();
    render(<AppAlertHost />);
    act(() => AppAlert.alert('通報理由', '', [
      { text: 'スパム', onPress: reason }, { text: '不適切' }, { text: 'ハラスメント' }, { text: 'キャンセル' },
    ]));
    fireEvent.press(screen.getByText('スパム'));
    expect(reason).toHaveBeenCalledTimes(1);
  });
  it('非同期コールバックの失敗を未処理にせず案内する', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    render(<AppAlertHost />);
    act(() => AppAlert.alert('確認', '', [{ text: '実行', onPress: async () => { throw new Error('offline'); } }]));
    await act(async () => { fireEvent.press(screen.getByText('実行')); });
    expect(screen.getByText('処理を完了できませんでした')).toBeTruthy();
    fireEvent.press(screen.getByText('OK'));
  });
  it('同じ確認コールバックが二度呼ばれても変更処理は一回だけ', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const action = jest.fn();
    AppAlert.alert('確認', '', [{ text: '実行', onPress: action }]);
    const callback = native.mock.calls[0][2]![0].onPress!;
    callback(); callback();
    expect(action).toHaveBeenCalledTimes(1);
  });
  it('アカウント切替後に古いネイティブ確認を押しても処理しない', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const action = jest.fn();
    AppAlert.alert('古い確認', '', [{ text: '実行', onPress: action }]);
    const callback = native.mock.calls[0][2]![0].onPress!;
    clearAppAlerts();
    callback();
    expect(action).not.toHaveBeenCalled();
  });
  it('切替時はWebの待機中ダイアログと遅れて届くエラーも破棄する', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    let reject!: (error: Error) => void;
    render(<AppAlertHost />);
    act(() => AppAlert.alert('確認', '', [{ text: '実行', onPress: () => new Promise<void>((_, fail) => { reject = fail; }) }]));
    fireEvent.press(screen.getByText('実行'));
    act(() => AppAlert.alert('古い待機中の案内'));
    act(() => clearAppAlerts());
    await act(async () => { reject(new Error('late failure')); });
    expect(screen.queryByText('古い待機中の案内')).toBeNull();
    expect(screen.queryByText('処理を完了できませんでした')).toBeNull();
  });
});
