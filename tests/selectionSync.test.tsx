// @vitest-environment jsdom
/**
 * Release blocker (master file): map, profile, 3D, briefing and export must never disagree about
 * the selected route or the inspected sample.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutedApp, switchTo2d, switchTo3d } from './appHelpers';
import { fileFetch } from './helpers';

beforeEach(() => {
  vi.stubGlobal('fetch', fileFetch());
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function consumers() {
  const map = screen.queryByTestId('map-canvas');
  const t3d = screen.queryByTestId('terrain-view');
  return {
    map: map ? { id: map.dataset.selectedCandidate, hover: map.dataset.hoverIndex } : null,
    t3d: t3d ? { id: t3d.dataset.selectedCandidate, hover: t3d.dataset.hoverIndex } : null,
    profile: { id: screen.getByTestId('profile').dataset.candidateId, hover: screen.getByTestId('profile').dataset.hoverIndex },
    briefing: { id: screen.getByTestId('briefing').dataset.candidateId, hover: screen.getByTestId('briefing').dataset.hoverIndex },
  };
}

describe('selection + hover sync', () => {
  it('selecting a candidate updates map, profile, 3D props, briefing and export consistently', async () => {
    let exported = '';
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { void b.text().then((t) => (exported = t)); return 'blob:x'; }, revokeObjectURL: () => undefined }));
    HTMLAnchorElement.prototype.click = () => undefined;
    await renderRoutedApp({ detectWebGL: () => ({ ok: true, version: 2 }) });

    const radios = screen.getAllByRole('radio', { name: /feasible|aware/ });
    expect(radios.length).toBeGreaterThanOrEqual(2);
    for (const [i, radio] of radios.entries()) {
      const id = `c${i}`;
      fireEvent.click(radio);
      // 2D view
      switchTo2d();
      let c = consumers();
      expect(c.map?.id).toBe(id);
      expect(c.profile.id).toBe(id);
      expect(c.briefing.id).toBe(id);
      expect(screen.getByTestId('briefing').textContent).toContain(`Selected route ${id}`);
      // 3D view gets the same selection
      switchTo3d();
      await screen.findByTestId('terrain-view');
      c = consumers();
      expect(c.t3d?.id).toBe(id);
      expect(c.profile.id).toBe(id);
      expect(c.briefing.id).toBe(id);
      // export names the same route
      fireEvent.click(screen.getByText('Export JSON'));
      await vi.waitFor(() => expect(JSON.parse(exported).selectedCandidateId).toBe(id));
      exported = '';
    }
  });

  it('hovering a profile sample is shared by map, 3D and briefing, and cleared on reselection', async () => {
    await renderRoutedApp({ detectWebGL: () => ({ ok: true, version: 2 }) });
    fireEvent.change(screen.getByLabelText('Inspect position along route'), { target: { value: '5' } });
    let c = consumers();
    expect(c.map?.hover).toBe('5');
    expect(c.profile.hover).toBe('5');
    expect(c.briefing.hover).toBe('5');
    expect(screen.getByTestId('briefing-hover').textContent).toMatch(/along route/);
    switchTo3d();
    await screen.findByTestId('terrain-view');
    expect(consumers().t3d?.hover).toBe('5');
    // selecting another candidate drops the stale hover everywhere
    fireEvent.click(screen.getAllByRole('radio', { name: /feasible|aware/ })[1]!);
    c = consumers();
    expect(c.t3d?.hover).toBe('');
    expect(c.profile.hover).toBe('');
    expect(c.briefing.hover).toBe('');
  });
});
