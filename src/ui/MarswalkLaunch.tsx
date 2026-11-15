/**
 * "Walk this route in Marswalk VR" — sends the selected planner route to the WebXR walk (Quest 2 or PC).
 * OWNER: Dhani (UI). The walk itself lives in `marswalk/app` and is built to `dist/marswalk-vr/`.
 */
import { useState } from 'react';
import type { GridBundle, RouteCandidate } from '../contracts';
import type { MissionInputs } from '../state/store';
import { getUnifiedPoisForBundle } from '../terrain3d/coordBridge';
import { useUiLang } from './i18n';
import {
  buildMarswalkLaunchUrl,
  buildMarswalkPayload,
  marswalkFrameFor,
  storeMarswalkPayload,
} from './marswalkHandoff';

interface Props {
  bundle: GridBundle;
  candidate: RouteCandidate | null;
  mission: MissionInputs;
  modelVersion: string;
  isStale: boolean;
}

export function MarswalkLaunch({ bundle, candidate, mission, modelVersion, isStale }: Props) {
  const [lang] = useUiLang();
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
      {
        start: nameOf(mission.start?.poiId ?? null, lang === 'it' ? 'Partenza' : 'Start'),
        destination: nameOf(mission.destination?.poiId ?? null, lang === 'it' ? 'Destinazione' : 'Destination'),
      },
      modelVersion,
    );
    if (!payload) {
      setNote(
        lang === 'it'
          ? 'Questo percorso è fuori dall’area Marswalk a 1 m e non può essere avviato.'
          : 'This route lies outside the area Marswalk renders at 1 m, so it cannot be walked.',
      );
      return;
    }
    const stored = storeMarswalkPayload(payload);
    const url = buildMarswalkLaunchUrl(lang, payload, stored);
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
        {lang === 'it' ? 'Cammina su questo percorso in Marswalk VR' : 'Walk this route in Marswalk VR'}
      </button>
      <p className="muted">
        {!supported
          ? lang === 'it'
            ? 'Disponibile solo sui dataset reali di Jezero.'
            : 'Available on the real Jezero bundles only.'
          : !candidate
            ? lang === 'it'
              ? 'Calcola prima un percorso: il candidato scelto diventa la linea guida in VR (Quest 2 o PC).'
              : 'Calculate a route first: the selected candidate becomes the line you follow in VR (Quest 2 or PC).'
            : isStale
              ? lang === 'it'
                ? 'Ricalcola prima: i parametri sono cambiati dopo l’ultimo calcolo.'
                : 'Recalculate first: inputs changed since this route was computed.'
              : lang === 'it'
                ? 'Apre la stazione WebXR sullo stesso terreno HiRISE con questo percorso da seguire.'
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
