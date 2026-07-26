import { render, screen, fireEvent } from '@testing-library/react-native';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

describe('StateViews', () => {
  it('LoadingView renders a busy indicator', () => {
    render(<LoadingView />);
    // ActivityIndicator は accessibilityRole を持たないので testID 代わりに存在確認
    expect(screen.UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy();
  });

  it('ErrorBanner shows the message and is announced as an alert', () => {
    render(<ErrorBanner message="読み込みに失敗しました" onRetry={() => {}} />);
    const msg = screen.getByText('読み込みに失敗しました');
    expect(msg).toBeTruthy();
    // スクリーンリーダー向けに alert ロールが付いている（バナー View）
    expect(screen.UNSAFE_getByProps({ accessibilityRole: 'alert' })).toBeTruthy();
  });

  it('ErrorBanner の再読み込みで onRetry が呼ばれる', () => {
    const onRetry = jest.fn();
    render(<ErrorBanner message="x" onRetry={onRetry} />);
    fireEvent.press(screen.getByText('再読み込み'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
