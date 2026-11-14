import { expect } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EXPECTED_MODEL_VERSION } from '../src/config';
import { AppStateProvider } from '../src/state/AppStateProvider';
import { App, type AppDeps } from '../src/ui/App';
import { FakeWorker } from './helpers';

export function renderApp(deps: AppDeps = {}) {
  return render(
    <AppStateProvider modelVersion={EXPECTED_MODEL_VERSION}>
      <App deps={{ workerOptions: { createWorker: () => new FakeWorker() }, ...deps }} />
    </AppStateProvider>,
  );
}

/** Loads the fixture, picks outpost -> east bench and calculates. */
export async function renderRoutedApp(deps: AppDeps = {}) {
  const r = renderApp(deps);
  await waitFor(() => screen.getByLabelText('start preset'));
  fireEvent.change(screen.getByLabelText('start preset'), { target: { value: 'syn-outpost' } });
  fireEvent.change(screen.getByLabelText('destination preset'), { target: { value: 'syn-east-bench' } });
  await act(async () => {
    fireEvent.click(screen.getByTestId('calculate'));
  });
  await waitFor(() => expect(screen.getByTestId('route-status').textContent).toContain('success'));
  return r;
}

export const switchTo3d = () => fireEvent.click(screen.getByLabelText('3D'));
export const switchTo2d = () => fireEvent.click(screen.getByLabelText('2D'));
