import { createContext } from 'react';

/** 保存成功をルートの初回設定判定へ反映し、再ログインを不要にする。 */
export const OnboardingCompletedContext = createContext<() => void>(() => {});
