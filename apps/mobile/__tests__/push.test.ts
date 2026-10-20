const mockPermissions = jest.fn();
const mockToken = jest.fn();
const mockGetUser = jest.fn();
const mockRpc = jest.fn();
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: (...args: unknown[]) => mockPermissions(...args),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: (...args: unknown[]) => mockToken(...args),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  rpc: (...args: unknown[]) => mockRpc(...args),
} }));

import { registerPushToken, unregisterPushToken } from '@/lib/push';
import { Platform } from 'react-native';

describe('push token registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockPermissions.mockResolvedValue({ status: 'granted' });
    mockToken.mockResolvedValue({ data: 'ExpoPushToken[test]' });
    mockRpc.mockResolvedValue({ error: null });
  });

  it('Webでは権限取得や登録をしない', async () => {
    Platform.OS = 'web';
    expect(await registerPushToken('u1')).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockPermissions).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('指定ユーザーと異なる場合は権限要求をしない', async () => {
    expect(await registerPushToken('u2')).toBeNull();
    expect(mockPermissions).not.toHaveBeenCalled();
  });

  it('トークン取得中にユーザーが変わったら登録しない', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
      .mockResolvedValueOnce({ data: { user: { id: 'u2' } } });
    expect(await registerPushToken('u1')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('ユーザーが同じならトークンを登録する', async () => {
    expect(await registerPushToken('u1')).toBe('ExpoPushToken[test]');
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_token: 'ExpoPushToken[test]', p_platform: 'ios',
    });
  });

  it('解除のRPCエラーを呼び出し元へ返す', async () => {
    mockRpc.mockResolvedValue({ error: new Error('offline') });
    await expect(unregisterPushToken('ExpoPushToken[test]')).rejects.toThrow('offline');
  });
});
