import { render, screen, fireEvent } from '@testing-library/react-native';
import { StreakCard, type StreakState } from '@/components/StreakCard';

const base: StreakState = {
  current_streak: 0,
  longest_streak: 0,
  claimed_today: false,
  next_day_index: 1,
  next_reward: 1000,
  max_day_index: 7,
  broken: false,
};

const s = (over: Partial<StreakState> = {}): StreakState => ({ ...base, ...over });

describe('StreakCard', () => {
  it('未受け取りなら今日の報酬額つきのボタンを出す', () => {
    render(<StreakCard state={s({ next_reward: 1500, next_day_index: 2 })} onClaim={() => {}} />);
    expect(screen.getByText('＋1,500 P を受け取る')).toBeTruthy();
    expect(screen.getByText('2日目')).toBeTruthy();
  });

  it('ボタンを押すと onClaim が呼ばれる', () => {
    const onClaim = jest.fn();
    render(<StreakCard state={s()} onClaim={onClaim} />);
    fireEvent.press(screen.getByText('＋1,000 P を受け取る'));
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('busy 中は押せない', () => {
    const onClaim = jest.fn();
    render(<StreakCard state={s()} busy onClaim={onClaim} />);
    fireEvent.press(screen.getByText('...'));
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('受け取り済みならボタンを出さず、明日の案内を出す', () => {
    render(<StreakCard state={s({ claimed_today: true, current_streak: 3 })} onClaim={() => {}} />);
    expect(screen.queryByText(/を受け取る/)).toBeNull();
    expect(screen.getByText(/明日で 4日目/)).toBeTruthy();
    expect(screen.getByText('3日目')).toBeTruthy();
  });

  it('最終段まで受け取ったら新しい1周の案内にする', () => {
    render(<StreakCard state={s({ claimed_today: true, current_streak: 7 })} onClaim={() => {}} />);
    expect(screen.getByText(/新しい1周/)).toBeTruthy();
  });

  it('段階の数だけドットを描く（最終段は★）', () => {
    render(<StreakCard state={s({ max_day_index: 7 })} onClaim={() => {}} />);
    // 1..6 は数字、7段目は ★
    for (const n of ['1', '2', '3', '4', '5', '6']) {
      expect(screen.getByText(n)).toBeTruthy();
    }
    expect(screen.getByText('★')).toBeTruthy();
  });

  it('段階数が違っても描画できる（設定変更に追従する）', () => {
    render(<StreakCard state={s({ max_day_index: 3 })} onClaim={() => {}} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('★')).toBeTruthy();
    expect(screen.queryByText('4')).toBeNull();
  });

  it('途切れた直後は理由を明示する', () => {
    render(<StreakCard state={s({ broken: true })} onClaim={() => {}} />);
    expect(screen.getByText('連続が途切れました。今日からまた1日目です。')).toBeTruthy();
  });

  it('受け取り済みなら途切れの警告は出さない（今日から再開しているため）', () => {
    render(<StreakCard state={s({ broken: true, claimed_today: true, current_streak: 1 })} onClaim={() => {}} />);
    expect(screen.queryByText(/連続が途切れました/)).toBeNull();
  });

  it('最長記録は2日以上のときだけ出す', () => {
    const { queryByText } = render(<StreakCard state={s({ longest_streak: 1 })} onClaim={() => {}} />);
    expect(queryByText(/最長記録/)).toBeNull();

    render(<StreakCard state={s({ longest_streak: 12 })} onClaim={() => {}} />);
    expect(screen.getByText('最長記録 12日')).toBeTruthy();
  });

  it('読み上げ用のラベルに報酬額を含める', () => {
    render(<StreakCard state={s({ next_reward: 3000 })} onClaim={() => {}} />);
    expect(screen.getByLabelText('連続ログインボーナス 3000ポイントを受け取る')).toBeTruthy();
  });
});
