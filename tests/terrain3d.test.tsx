// @vitest-environment jsdom
/** 3D degradation: no WebGL, render throw, chunk load failure, context loss, retry. */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectWebGL } from '../src/app/webgl';
import type { TerrainViewProps } from '../src/terrain3d/TerrainView';
import { renderRoutedApp, switchTo3d } from './appHelpers';
import { fileFetch } from './helpers';

beforeEach(() => {
  vi.stubGlobal('fetch', fileFetch());
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  vi.spyOn(console, 'error').mockImplementation(() => undefined); // React logs caught boundary errors
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const webglOk = () => ({ ok: true as const, version: 2 as const });

describe('3D slot degradation', () => {
  it('detectWebGL reports unavailable when no context can be created', () => {
    expect(detectWebGL(document)).toMatchObject({ ok: false });
  });

  it('no WebGL -> accurate message + 2D map + profile + briefing keep working', async () => {
    await renderRoutedApp({ detectWebGL: () => ({ ok: false, reason: 'test: no WebGL' }) });
    switchTo3d();
    const fb = await screen.findByTestId('terrain-fallback');
    expect(fb.dataset.kind).toBe('webgl-unavailable');
    expect(fb.textContent).toMatch(/WebGL is not available.*test: no WebGL/);
    expect(screen.queryByText('Retry 3D')).toBeNull();
    expect(screen.getByTestId('map-canvas')).toBeTruthy();
    expect(screen.getByTestId('profile').dataset.candidateId).toBe('c0');
    expect(screen.getByTestId('briefing').dataset.candidateId).toBe('c0');
    expect(screen.getByTestId('route-status').textContent).toContain('success'); // route not lost
  });

  it('render throw is caught by the error boundary and degrades to 2D; retry recovers', async () => {
    let shouldThrow = true;
    const Boom = (p: TerrainViewProps) => {
      if (shouldThrow) throw new Error('kaboom in three.js');
      return <div data-testid="terrain-view" data-selected-candidate={p.selectedCandidateId ?? ''} />;
    };
    await renderRoutedApp({ detectWebGL: webglOk, loadTerrainView: () => Promise.resolve({ default: Boom }) });
    switchTo3d();
    const fb = await screen.findByTestId('terrain-fallback');
    expect(fb.dataset.kind).toBe('render-error');
    expect(fb.textContent).toContain('kaboom in three.js');
    expect(screen.getByTestId('map-canvas')).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByText('Retry 3D'));
    expect((await screen.findByTestId('terrain-view')).dataset.selectedCandidate).toBe('c0');
  });

  it('chunk load failure degrades with a load-error message', async () => {
    await renderRoutedApp({
      detectWebGL: webglOk,
      loadTerrainView: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: TerrainView.js')),
    });
    switchTo3d();
    expect((await screen.findByTestId('terrain-fallback')).dataset.kind).toBe('load-error');
  });

  it('context loss reported via onError degrades to 2D', async () => {
    const LosesContext = ({ onError }: TerrainViewProps) => {
      useEffect(() => onError?.({ kind: 'context-lost', message: 'webglcontextlost' }), [onError]);
      return <div />;
    };
    await renderRoutedApp({ detectWebGL: webglOk, loadTerrainView: () => Promise.resolve({ default: LosesContext }) });
    switchTo3d();
    const fb = await screen.findByTestId('terrain-fallback');
    expect(fb.dataset.kind).toBe('context-lost');
    expect(fb.textContent).toMatch(/context was lost/);
  });

  it('real placeholder loads behind Suspense when WebGL is available', async () => {
    await renderRoutedApp({ detectWebGL: webglOk });
    switchTo3d();
    await waitFor(() => expect(screen.getByTestId('terrain-view').dataset.selectedCandidate).toBe('c0'));
  });
});
