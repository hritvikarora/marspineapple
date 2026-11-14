// @vitest-environment jsdom
/**
 * App-level smoke journey (jsdom): load fixture -> presets -> calculate via worker protocol
 * -> success -> change input -> stale label -> invalid bundle shows stage error.
 * The real browser Worker is replaced by FakeWorker (same handler code).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPECTED_MODEL_VERSION } from '../src/config';
import { AppStateProvider } from '../src/state/AppStateProvider';
import { App } from '../src/ui/App';
import { FakeWorker, fileFetch } from './helpers';

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderApp = () =>
  render(
    <AppStateProvider modelVersion={EXPECTED_MODEL_VERSION}>
      <App workerOptions={{ createWorker: () => new FakeWorker() }} />
    </AppStateProvider>,
  );

describe('app shell smoke', () => {
  it('runs the preset journey end to end', async () => {
    vi.stubGlobal('fetch', fileFetch());
    renderApp();
    await waitFor(() => expect(screen.getByTestId('release-id').textContent).toContain('synthetic-v0.1.0'));
    expect(screen.getByTestId('release-id').textContent).toContain(EXPECTED_MODEL_VERSION);
    expect(screen.getByTestId('synthetic-badge')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('start preset'), { target: { value: 'syn-outpost' } });
    fireEvent.change(screen.getByLabelText('destination preset'), { target: { value: 'syn-east-bench' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('calculate'));
    });
    await waitFor(() => expect(screen.getByTestId('route-status').textContent).toContain('success'));
    expect(screen.getAllByRole('radio', { name: /uncertainty-aware/ }).length).toBe(1);

    // Display-only change keeps the result current; mission change marks it stale.
    fireEvent.click(screen.getByLabelText('slope'));
    expect(screen.queryByTestId('stale')).toBeNull();
    fireEvent.click(screen.getByLabelText('Round trip'));
    expect(screen.getByTestId('stale')).toBeTruthy();
  });

  it('shows the no-path state for the sealed basin', async () => {
    vi.stubGlobal('fetch', fileFetch());
    renderApp();
    await waitFor(() => screen.getByLabelText('start preset'));
    fireEvent.change(screen.getByLabelText('start preset'), { target: { value: 'syn-outpost' } });
    fireEvent.change(screen.getByLabelText('destination preset'), { target: { value: 'syn-sealed-basin' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('calculate'));
    });
    await waitFor(() => expect(screen.getByTestId('route-status').textContent).toContain('no-path'));
  });

  it('surfaces a stage-specific bundle error instead of an empty map', async () => {
    vi.stubGlobal('fetch', fileFetch((u) => (u.endsWith('elevation.f32') ? new Response('', { status: 404 }) : undefined)));
    renderApp();
    await waitFor(() => expect(screen.getByTestId('bundle-error').textContent).toContain('fetch-raster'));
    expect(screen.queryByTestId('map-canvas')).toBeNull();
  });
});
