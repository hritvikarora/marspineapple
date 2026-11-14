// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MissionInputs } from '../../../state/store';
import { Assumptions } from './Assumptions';
import entry from './entry';

afterEach(() => {
  cleanup();
});

const defaultMission: MissionInputs = {
  start: { point: { east_m: 0, north_m: 0 }, poiId: null },
  destination: { point: { east_m: 1000, north_m: 1000 }, poiId: null },
  policies: ['shortest-feasible'],
  weightOverrides: {},
  strictQuality: false,
  roundTrip: false,
  modelVersion: 'synthetic-v0',
};

describe('TASK-005: Mission Assumptions', () => {
  it('registers valid FeatureModule contract', () => {
    expect(entry.id).toBe('assumptions');
    expect(entry.slot).toBe('assumptions');
    expect(entry.Component).toBeDefined();
  });

  it('renders all 3 supported routing policies with descriptions', () => {
    const dispatch = vi.fn();
    render(
      <Assumptions
        mission={defaultMission}
        strictQualitySupported={true}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByText('Shortest Feasible')).toBeTruthy();
    expect(screen.getByText('Terrain Aware')).toBeTruthy();
    expect(screen.getByText('Uncertainty Aware')).toBeTruthy();

    const shortestCheckbox = screen.getByTestId('policy-toggle-shortest-feasible') as HTMLInputElement;
    const terrainCheckbox = screen.getByTestId('policy-toggle-terrain-aware') as HTMLInputElement;
    const uncertaintyCheckbox = screen.getByTestId('policy-toggle-uncertainty-aware') as HTMLInputElement;

    expect(shortestCheckbox.checked).toBe(true);
    expect(terrainCheckbox.checked).toBe(false);
    expect(uncertaintyCheckbox.checked).toBe(false);
  });

  it('toggling on an unselected policy dispatches mission/setPolicies with updated array', () => {
    const dispatch = vi.fn();
    render(
      <Assumptions
        mission={defaultMission}
        strictQualitySupported={true}
        dispatch={dispatch}
      />,
    );

    const terrainCheckbox = screen.getByTestId('policy-toggle-terrain-aware');
    fireEvent.click(terrainCheckbox);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'mission/setPolicies',
      policies: ['shortest-feasible', 'terrain-aware'],
    });
  });

  it('toggling off a selected policy dispatches mission/setPolicies removing it', () => {
    const dispatch = vi.fn();
    render(
      <Assumptions
        mission={{ ...defaultMission, policies: ['shortest-feasible', 'terrain-aware'] }}
        strictQualitySupported={true}
        dispatch={dispatch}
      />,
    );

    const shortestCheckbox = screen.getByTestId('policy-toggle-shortest-feasible');
    fireEvent.click(shortestCheckbox);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'mission/setPolicies',
      policies: ['terrain-aware'],
    });
  });

  it('displays a warning when no policies are selected', () => {
    const dispatch = vi.fn();
    render(
      <Assumptions
        mission={{ ...defaultMission, policies: [] }}
        strictQualitySupported={true}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByTestId('no-policies-warning')).toBeTruthy();
  });

  it('toggling strict quality dispatches mission/setStrictQuality', () => {
    const dispatch = vi.fn();
    render(
      <Assumptions
        mission={defaultMission}
        strictQualitySupported={true}
        dispatch={dispatch}
      />,
    );

    const strictToggle = screen.getByTestId('strict-quality-toggle');
    fireEvent.click(strictToggle);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'mission/setStrictQuality',
      value: true,
    });
  });

  it('disables strict quality when unsupported', () => {
    const dispatch = vi.fn();
    render(
      <Assumptions
        mission={defaultMission}
        strictQualitySupported={false}
        dispatch={dispatch}
      />,
    );

    const strictToggle = screen.getByTestId('strict-quality-toggle') as HTMLInputElement;
    expect(strictToggle.disabled).toBe(true);
    expect(screen.getByText(/Strict quality exclusion is not available/)).toBeTruthy();
  });

  it('toggling round-trip dispatches mission/setRoundTrip', () => {
    const dispatch = vi.fn();
    render(
      <Assumptions
        mission={defaultMission}
        strictQualitySupported={true}
        dispatch={dispatch}
      />,
    );

    const roundTripToggle = screen.getByTestId('round-trip-toggle');
    fireEvent.click(roundTripToggle);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'mission/setRoundTrip',
      value: true,
    });
  });

  it('does not invent unsupported oxygen, life-support, or battery gauges', () => {
    const dispatch = vi.fn();
    render(
      <Assumptions
        mission={defaultMission}
        strictQualitySupported={true}
        dispatch={dispatch}
      />,
    );

    expect(screen.queryByText(/oxygen/i)).toBeNull();
    expect(screen.queryByText(/battery/i)).toBeNull();
    expect(screen.queryByText(/life support/i)).toBeNull();
    expect(screen.queryByText(/survival/i)).toBeNull();
  });
});
