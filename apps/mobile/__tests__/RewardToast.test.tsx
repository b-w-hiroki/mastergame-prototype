import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useReward } from '@/components/RewardToast';

// useReward はフックなので、node を描画する薄いホスト経由でテストする。
function Host({ onReady }: { onReady: (show: (n: number, l?: string) => void) => void }) {
  const reward = useReward();
  onReady(reward.show);
  return <>{reward.node}</>;
}

describe('useReward', () => {
  // Animated が遅延タイマーを残すため擬似タイマーで確定的にする
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('初期状態では演出ノードを描画しない', () => {
    let _show: (n: number, l?: string) => void = () => {};
    const { queryByText } = render(<Host onReady={(s) => { _show = s; }} />);
    expect(queryByText(/P$/)).toBeNull();
  });

  it('show() で獲得ポイントとラベルを演出表示する', () => {
    let show: (n: number, l?: string) => void = () => {};
    const { getByText } = render(<Host onReady={(s) => { show = s; }} />);
    act(() => { show(1200, 'デイリーミッション'); });
    expect(getByText('＋1,200 P')).toBeTruthy();
    expect(getByText('デイリーミッション')).toBeTruthy();
  });

  it('ラベル無しでも金額だけ表示できる', () => {
    let show: (n: number, l?: string) => void = () => {};
    const { getByText } = render(<Host onReady={(s) => { show = s; }} />);
    act(() => { show(50); });
    expect(getByText('＋50 P')).toBeTruthy();
  });
});
