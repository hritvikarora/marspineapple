import { createContext, useContext, type Dispatch } from 'react';
import type { Action, AppState } from './store';

export interface AppStateCtx {
  state: AppState;
  dispatch: Dispatch<Action>;
}
export const AppStateContext = createContext<AppStateCtx | null>(null);

export function useAppState(): AppStateCtx {
  const c = useContext(AppStateContext);
  if (!c) throw new Error('useAppState must be used inside <AppStateProvider>');
  return c;
}
