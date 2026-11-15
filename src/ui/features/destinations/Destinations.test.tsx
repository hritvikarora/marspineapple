// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PointOfInterest } from '../../../contracts';
import type { MissionInputs } from '../../../state/store';
import { Destinations } from './Destinations';
import entry from './entry';

afterEach(() => {
  cleanup();
});

const mockPois: PointOfInterest[] = [
  {
    id: 'outpost-alpha',
    name: 'Outpost Alpha',
    kind: 'outpost',
    position: { east_m: 100, north_m: 200 },
    purpose: 'Habitation facility',
    officialName: false,
    positionalUncertainty_m: 5,
    sourceIds: ['s1'],
    synthetic: true,
  },
  {
    id: 'stop-crater',
    name: 'Gullied Crater Rim',
    kind: 'science-stop',
    position: { east_m: 500, north_m: 800 },
    purpose: 'Examine sedimentary layering and possible fluvial erosion features.',
    officialName: true,
    positionalUncertainty_m: 1.5,
    sourceIds: ['s1', 's2'],
    synthetic: false,
  },
  {
    id: 'stop-dune',
    name: 'Basaltic Sand Sheet',
    kind: 'science-stop',
    position: { east_m: 1200, north_m: 1500 },
    purpose: 'Measure grain size distribution and dark mineral composition.',
    officialName: false,
    positionalUncertainty_m: 3.0,
    sourceIds: ['s2'],
    synthetic: true,
  },
  {
    id: 'context-ridge',
    name: 'North Ridge Viewpoint',
    kind: 'context',
    position: { east_m: 2000, north_m: 2500 },
    purpose: 'Regional context',
    officialName: false,
    positionalUncertainty_m: null,
    sourceIds: [],
    synthetic: true,
  },
];

const initialMission: MissionInputs = {
  start: { point: { east_m: 100, north_m: 200 }, poiId: 'outpost-alpha' },
  destination: null,
  policies: ['shortest-feasible'],
  weightOverrides: {},
  strictQuality: false,
  roundTrip: false,
  modelVersion: 'synthetic-v0',
};

describe('TASK-003: Science Destination Selector', () => {
  it('registers valid FeatureModule contract', () => {
    expect(entry.id).toBe('destinations');
    expect(entry.slot).toBe('destinations');
    expect(entry.Component).toBeDefined();
  });

  it('filters POIs to only science-stop items', () => {
    const setEndpoint = vi.fn();
    render(
      <Destinations
        pois={mockPois}
        mission={initialMission}
        setEndpoint={setEndpoint}
      />,
    );

    const select = screen.getByTestId('destinations-dropdown') as HTMLSelectElement;
    expect(select.options).toHaveLength(3); // placeholder + 2 science stops
    expect(within(select).queryByText(/Outpost Alpha/)).toBeNull();
    expect(within(select).queryByText(/North Ridge Viewpoint/)).toBeNull();
    expect(screen.getAllByText(/Gullied Crater Rim/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Basaltic Sand Sheet/).length).toBeGreaterThan(0);
  });

  it('renders helpful message when no science stops exist', () => {
    const setEndpoint = vi.fn();
    render(
      <Destinations
        pois={[]}
        mission={initialMission}
        setEndpoint={setEndpoint}
      />,
    );

    expect(screen.getByTestId('no-science-stops')).toBeTruthy();
    expect(screen.queryByTestId('destinations-dropdown')).toBeNull();
  });

  it('selecting a destination preset via dropdown updates destination without modifying start', () => {
    const setEndpoint = vi.fn();

    render(
      <Destinations
        pois={mockPois}
        mission={initialMission}
        setEndpoint={setEndpoint}
      />,
    );

    const select = screen.getByTestId('destinations-dropdown');
    fireEvent.change(select, { target: { value: 'stop-crater' } });

    expect(setEndpoint).toHaveBeenCalledTimes(1);
    expect(setEndpoint).toHaveBeenCalledWith('destination', { east_m: 500, north_m: 800 }, 'stop-crater');
    expect(setEndpoint).not.toHaveBeenCalledWith('start', expect.anything(), expect.anything());
  });

  it('selecting a destination preset via quick-pick button updates destination', () => {
    const setEndpoint = vi.fn();

    render(
      <Destinations
        pois={mockPois}
        mission={initialMission}
        setEndpoint={setEndpoint}
      />,
    );

    const button = screen.getByTestId('destination-chip-stop-dune');
    fireEvent.click(button);

    expect(setEndpoint).toHaveBeenCalledWith('destination', { east_m: 1200, north_m: 1500 }, 'stop-dune');
  });

  it('clearing the selection dispatches null destination without modifying start', () => {
    const setEndpoint = vi.fn();

    const missionWithDest: MissionInputs = {
      ...initialMission,
      destination: { point: { east_m: 500, north_m: 800 }, poiId: 'stop-crater' },
    };

    render(
      <Destinations
        pois={mockPois}
        mission={missionWithDest}
        setEndpoint={setEndpoint}
      />,
    );

    const select = screen.getByTestId('destinations-dropdown');
    fireEvent.change(select, { target: { value: '' } });

    expect(setEndpoint).toHaveBeenCalledWith('destination', null, null);
  });

  it('displays scientific details and planar coordinates for selected destination', () => {
    const setEndpoint = vi.fn();

    const missionWithDest: MissionInputs = {
      ...initialMission,
      destination: { point: { east_m: 500, north_m: 800 }, poiId: 'stop-crater' },
    };

    render(
      <Destinations
        pois={mockPois}
        mission={missionWithDest}
        setEndpoint={setEndpoint}
      />,
    );

    const details = screen.getByTestId('selected-destination-details');
    expect(details).toBeTruthy();
    expect(within(details).getByText('Gullied Crater Rim')).toBeTruthy();
    expect(within(details).getByText('Official Feature')).toBeTruthy();
    expect(within(details).getByText(/Examine sedimentary layering/)).toBeTruthy();
    expect(screen.getByText('500 m')).toBeTruthy();
    expect(screen.getByText('800 m')).toBeTruthy();
    expect(screen.getByText('±1.5 m')).toBeTruthy();
  });

  it('displays synthetic target tag when selected POI is synthetic', () => {
    const setEndpoint = vi.fn();

    const missionWithDest: MissionInputs = {
      ...initialMission,
      destination: { point: { east_m: 1200, north_m: 1500 }, poiId: 'stop-dune' },
    };

    render(
      <Destinations
        pois={mockPois}
        mission={missionWithDest}
        setEndpoint={setEndpoint}
      />,
    );

    expect(screen.getByText('Synthetic Target')).toBeTruthy();
    expect(screen.getByText('Mission Target')).toBeTruthy();
  });

  it('renders a long science-stop place name while keeping the option value equal to the manifest id', () => {
    const longStop: PointOfInterest = {
      id: 'poi-long-ridge',
      name: 'Delta front – Skinner Ridge / Wildcat Ridge (Hawksbill Gap upper sedimentary outcrop traverse stop)',
      kind: 'science-stop',
      position: { east_m: 610.687, north_m: 656.7 },
      purpose: 'Inspect western delta front lower sedimentary layers.',
      officialName: false,
      positionalUncertainty_m: null,
      sourceIds: ['s1'],
      synthetic: false,
    };
    const setEndpoint = vi.fn();

    render(
      <Destinations
        pois={[...mockPois, longStop]}
        mission={initialMission}
        setEndpoint={setEndpoint}
      />,
    );

    const select = screen.getByTestId('destinations-dropdown') as HTMLSelectElement;
    const longOption = within(select).getByText(longStop.name) as HTMLOptionElement;
    expect(longOption).toBeTruthy();
    expect(longOption.value).toBe('poi-long-ridge');
    expect(screen.queryByTestId('selected-destination-details')).toBeNull();
    expect(screen.queryByText(longStop.purpose)).toBeNull();

    fireEvent.change(select, { target: { value: 'poi-long-ridge' } });
    expect(setEndpoint).toHaveBeenCalledWith('destination', { east_m: 610.687, north_m: 656.7 }, 'poi-long-ridge');
  });
});
