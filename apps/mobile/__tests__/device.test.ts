// AsyncStorage をインメモリで模す（端末IDの永続化が検知の前提なので、その挙動を固定する）
let mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
}));

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => mockGetUser(...a) }, rpc: (...a: unknown[]) => mockRpc(...a) },
}));

jest.mock('expo-device', () => ({ modelName: 'iPhone15,2', osVersion: '17.4', isDevice: true }));

import { getDeviceId, registerDevice } from '@/lib/device';

describe('device id', () => {
  beforeEach(() => { mockStore = {}; jest.clearAllMocks(); });

  it('UUID 形式の ID を生成する', async () => {
    const id = await getDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('二度目以降は同じ ID を返す（多重アカウント検知の前提）', async () => {
    const first = await getDeviceId();
    const second = await getDeviceId();
    expect(second).toBe(first);
  });

  it('既存の保存値を尊重する', async () => {
    mockStore['mg.device_id'] = 'preexisting-id';
    expect(await getDeviceId()).toBe('preexisting-id');
  });
});

describe('registerDevice', () => {
  beforeEach(() => { mockStore = {}; jest.clearAllMocks(); });

  it('未ログインなら何もしない', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await registerDevice();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('ログイン済みなら端末情報を register_device に送る', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockRpc.mockResolvedValue({ error: null });
    await registerDevice();
    expect(mockRpc).toHaveBeenCalledWith('register_device', expect.objectContaining({
      p_platform: expect.any(String),
      p_model: 'iPhone15,2',
      p_os_version: '17.4',
      p_is_emulator: false, // isDevice: true → 実機
    }));
  });

  it('RPC のエラーは呼び出し側に伝える', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockRpc.mockResolvedValue({ error: { message: 'boom' } });
    await expect(registerDevice()).rejects.toBeTruthy();
  });
});
