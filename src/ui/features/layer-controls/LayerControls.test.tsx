// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DisplayState } from '../../../state/store';
import { LayerControls } from './LayerControls';
import entry from './entry';

afterEach(() => {
  cleanup();
});

const defaultLayers: DisplayState['layers'] = {
  elevation: { visible: true, opacity: 1.0 },
  slope: { visible: true, opacity: 0.8 },
  roughness: { visible: false, opacity: 0.5 },
  quality: { visible: true, opacity: 0.9 },
  exclusion: { visible: true, opacity: 0.7 },
  route: { visible: true, opacity: 1.0 },
  poi: { visible: true, opacity: 1.0 },
};

describe('TASK-009: Layer Controls & Legends', () => {
  it('registers valid FeatureModule contract', () => {
    expect(entry.id).toBe('layer-controls');
    expect(entry.slot).toBe('layer-controls');
    expect(entry.Component).toBeDefined();
  });

  it('renders all 7 layer cards with their visibility checkboxes', () => {
    const dispatch = vi.fn();
    render(<LayerControls layers={defaultLayers} dispatch={dispatch} />);

    expect(screen.getByTestId('layer-card-elevation')).toBeTruthy();
    expect(screen.getByTestId('layer-card-slope')).toBeTruthy();
    expect(screen.getByTestId('layer-card-roughness')).toBeTruthy();
    expect(screen.getByTestId('layer-card-quality')).toBeTruthy();
    expect(screen.getByTestId('layer-card-exclusion')).toBeTruthy();
    expect(screen.getByTestId('layer-card-route')).toBeTruthy();
    expect(screen.getByTestId('layer-card-poi')).toBeTruthy();
  });

  it('toggling a layer checkbox dispatches view/setLayer with visible property', () => {
    const dispatch = vi.fn();
    render(<LayerControls layers={defaultLayers} dispatch={dispatch} />);

    const toggle = screen.getByTestId('layer-toggle-roughness');
    fireEvent.click(toggle);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'view/setLayer',
      layer: 'roughness',
      visible: true,
    });
  });

  it('adjusting an opacity slider dispatches view/setLayer with opacity property', () => {
    const dispatch = vi.fn();
    render(<LayerControls layers={defaultLayers} dispatch={dispatch} />);

    const slider = screen.getByTestId('layer-opacity-elevation');
    fireEvent.change(slider, { target: { value: '0.45' } });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'view/setLayer',
      layer: 'elevation',
      opacity: 0.45,
    });
  });

  it('renders legends only for visible layers', () => {
    const dispatch = vi.fn();
    render(<LayerControls layers={defaultLayers} dispatch={dispatch} />);

    // Slope is visible: should show slope legend
    expect(screen.getByText('15° – 25° (Moderate)')).toBeTruthy();
    expect(screen.getByText('> 25° (Steep / Critical)')).toBeTruthy();

    // Quality is visible: should show quality codes
    expect(screen.getByText('Low Quality (2)')).toBeTruthy();
    expect(screen.getByText('Unknown Quality (3)')).toBeTruthy();

    // Roughness is hidden: should not display roughness legend items
    expect(screen.queryByText('High Roughness Obstacles')).toBeNull();
  });

  it('never dispatches mission actions or stales routes when changing layers', () => {
    const dispatch = vi.fn();
    render(<LayerControls layers={defaultLayers} dispatch={dispatch} />);

    const toggle = screen.getByTestId('layer-toggle-elevation');
    fireEvent.click(toggle);

    // Only view/setLayer was dispatched
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]?.type).toBe('view/setLayer');
    expect(dispatch.mock.calls[0]?.[0]?.type).not.toContain('mission');
  });
});
