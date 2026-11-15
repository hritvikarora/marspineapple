/**
 * "Walk this route in Marswalk VR" — sends the selected planner route to the WebXR walk (Quest 2 or PC).
 * OWNER: Dhani (UI). The walk itself lives in `marswalk/app` and is built to `dist/marswalk-vr/`.
 */
import { useState } from 'react';
import type { GridBundle, RouteCandidate } from '../contracts';
import type { MissionInputs } from '../state/store';
import { getUnifiedPoisForBundle } from '../terrain3d/coordBridge';
import { MARSWALK_STORAGE_KEY, MARSWALK_URL, buildMarswalkPayload, marswalkFrameFor, storeMarswalkPayload } from './marswalkHandoff';

interface Props {
  bundle: GridBundle;
  candidate: RouteCandidate | null;
  mission: MissionInputs;
  modelVersion: string;
  isStale: boolean;
}

export function MarswalkLaunch({ bundle, candidate, mission, modelVersion, isStale }: Props) {
  const [note, setNote] = useState<string | null>(null);
  const supported = marswalkFrameFor(bundle) !== null;
  const nameOf = (poiId: string | null, fallback: string) => {
    if (!poiId) return fallback;
    const p = getUnifiedPoisForBundle(bundle).find((u) => u.id === poiId || u.manifestPoiId === poiId);
    return p?.shortLabel ?? fallback;
  };

  const launch = () => {
    if (!candidate) return;
    const payload = buildMarswalkPayload(
      bundle,
      candidate,
      { start: nameOf(mission.start?.poiId ?? null, 'Start'), destination: nameOf(mission.destination?.poiId ?? null, 'Destination') },
      modelVersion,
    );
    if (!payload) {
      setNote('This route lies outside the area Marswalk renders at 1 m, so it cannot be walked.');
      return;
    }
    const url = storeMarswalkPayload(payload)
      ? MARSWALK_URL
      : `${MARSWALK_URL}#${MARSWALK_STORAGE_KEY}=${encodeURIComponent(JSON.stringify(payload))}`;
    window.open(url, '_blank');
    setNote(null);
  };

  return (
    <div className="marswalk-launch" data-testid="marswalk-launch">
      <button
        type="button"
        className="marswalk-launch-btn"
        onClick={launch}
        disabled={!supported || !candidate || isStale}
        data-testid="marswalk-launch-button"
      >
        Walk this route in Marswalk VR
      </button>
      <p className="muted">
        {!supported
          ? 'Available on the real Jezero bundles only.'
          : !candidate
            ? 'Calculate a route first: the selected candidate becomes the line you follow in VR (Quest 2 or PC).'
            : isStale
              ? 'Recalculate first: inputs changed since this route was computed.'
              : 'Opens the WebXR walk on the same HiRISE terrain, with this route as the line to follow.'}
      </p>
      {note && (
        <p role="status" className="error">
          {note}
        </p>
      )}
    </div>
  );
}
