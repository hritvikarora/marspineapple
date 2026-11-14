import { useMemo, useReducer, type ReactNode } from 'react';
import { AppStateContext } from './context';
import { createInitialState, reducer } from './store';

export function AppStateProvider({ modelVersion, children }: { modelVersion: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, modelVersion, createInitialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
