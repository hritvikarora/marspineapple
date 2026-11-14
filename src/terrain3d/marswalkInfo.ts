/**
 * English legend, limitations, POI captions, credits, and canvas painters.
 * Pure TypeScript: no three, no DOM, no mission module, and no site.json prose.
 * Dataset sentences are copied from the English licence register and caption pack.
 */

import type { CorridorOffPathReason } from './coordBridge';
import type { OverlayLayerId } from './marswalkTypes';
import { drawText, formatDistance, formatDuration, roundRect, wrapText } from './marswalkUi';

const PHOTO_URL_PATTERN = /^\.\/sites\/jezero-delta\/photos\/[a-z0-9._-]+$/;
const LIFE_CAVEAT = 'This is not evidence of life.';
const CONTEXT_ONLY = 'Context only — outside the mapped area';
const SLOPE_GATE_DEG = 20;

const NEVER_FICTIONAL_IDS: ReadonlySet<string> = new Set([
  'P3',
  'P4',
  'P5',
  'poi-p3',
  'poi-p4',
  'poi-p5',
  'wildcat',
  'nukshak',
]);

export type WristLeg = 'outbound' | 'return';

export type PoiCaptionSource = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly summary: string;
  readonly inArea?: boolean;
  readonly photoUrl?: string | null;
  readonly interpretation?: string | null;
  readonly panoramas?: readonly string[] | null;
  readonly meda?: { readonly sol: number; readonly minC: number; readonly maxC: number } | null;
  /** Shape used by `UnifiedPoi.medaTempC`. */
  readonly medaTempC?: { readonly min: number; readonly max: number; readonly sol: number } | null;
};

export type PoiCaption = {
  readonly title: string;
  readonly lines: readonly string[];
  readonly fictional: boolean;
  readonly walkOffered: boolean;
  readonly photoUrl: string | null;
};

export type WalkDebriefSummary = {
  readonly elapsedSimSeconds: number;
  readonly traverseLength_m: number;
  readonly ascent_m: number;
  readonly descent_m: number;
  readonly minSlope_deg: number;
  readonly maxSlope_deg: number;
  readonly poiIdsVisited: readonly string[];
  readonly speed_m_s: number;
};

export type WristSnapshot = {
  readonly east_m: number;
  readonly north_m: number;
  readonly elevation_m: number;
  readonly slopeDeg: number;
  readonly candidateId: string | null;
  readonly progressFraction: number;
  readonly layer: OverlayLayerId;
  readonly leg?: WristLeg;
  readonly offPath: boolean;
  readonly dottedHit: {
    readonly label: string;
    readonly reason: string;
    readonly distance_m: number;
  } | null;
  readonly nearbyPoi: PoiCaptionSource | null;
  readonly arrival: WalkDebriefSummary | null;
};

export type OffPathDetail = {
  readonly reason: CorridorOffPathReason;
  readonly slopeDeg?: number | null;
  readonly exclusionCode?: number | null;
  readonly deviation_m?: number | null;
};

export type LegendEntry = {
  readonly id: string;
  readonly name: string;
  readonly units: string;
  readonly text: string;
};

export type DatasetCredit = {
  readonly id: string;
  readonly title: string;
  readonly doi: string | null;
  readonly licence: string;
  readonly creditLine: string;
  readonly citation: string;
  readonly urls: readonly string[];
};

type KnownPoi = {
  readonly inArea: boolean;
  readonly caption: string;
  readonly interpretation: string | null;
  readonly panoramas: readonly string[];
  readonly meda: { readonly sol: number; readonly minC: number; readonly maxC: number } | null;
};

const KNOWN_POIS: Readonly<Record<string, KnownPoi>> = {
  P3: {
    inArea: true,
    caption:
      'Delta front scarp where Perseverance climbed through Hawksbill Gap and cored layered sedimentary rocks at Skinner Ridge and Wildcat Ridge.',
    interpretation:
      'The Wildcat Ridge rock is interpreted as fine-grained mudstone/sandstone deposited as a lake dried, with sulfates; an instrument on the rover (SHERLOC) detected organic-molecule signals (NASA/JPL, Sept 2022). This is not evidence of life.',
    panoramas: [
      'Mastcam-Z 360 #19 Skinner Ridge',
      'Mastcam-Z 360 #20 Wildcat Ridge',
      'Mastcam-Z 360 #18 High-res Rockytop scarp',
    ],
    meda: { sol: 484, minC: -71.8, maxC: -20.5 },
  },
  P4: {
    inArea: true,
    caption:
      'Base of the delta front: bright, thinly layered rocks with the delta cliffs behind and sand in between.',
    interpretation:
      'Interpreted as basal delta-front sediments (sandstones/mudstones) laid down in standing water (Mars 2020 delta-front team abstracts).',
    panoramas: [
      'Mastcam-Z 360 #21 Enchanted Lake',
      'Mastcam-Z 360 #22 Hidden Harbor workspace',
      'Enchanted Lake mosaic (partial)',
    ],
    meda: { sol: 565, minC: -87.3, maxC: -23.6 },
  },
  P5: {
    inArea: true,
    caption:
      'Three Forks: the flat, sandy plain at the foot of the delta where Perseverance left ten sample tubes on the surface.',
    interpretation: 'A mission landmark rather than a distinct geological unit.',
    panoramas: [
      'Mastcam-Z 360 #24 Three Forks Depot #2 (all samples)',
      'Mastcam-Z 360 #23 Depot #1',
    ],
    meda: { sol: 690, minC: -84.4, maxC: -16.8 },
  },
  P1: {
    inArea: false,
    caption:
      'Landing site on the flat crater floor (Máaz formation): igneous rocks later altered by water (Farley et al. 2022).',
    interpretation: null,
    panoramas: ['Mastcam-Z 360 #1', 'Mastcam-Z 360 #2 (110 mm, delta horizon)'],
    meda: null,
  },
  P2: {
    inArea: false,
    caption:
      'Séítah: dark layered outcrops among dunes; olivine-rich rock from slowly cooled magma (Liu et al. 2022).',
    interpretation: null,
    panoramas: ['Mastcam-Z 360 #13 (Site 9 Drive 0, within Séítah)', "Mastcam-Z 360 #12 'Village' 110 mm"],
    meda: null,
  },
  P6: {
    inArea: false,
    caption:
      'Upper fan near Belva crater: inclined layers in the crater walls; interpreted as coarser river deposits from stronger flows than the lake deposits below (delta architecture: Mangold et al. 2021).',
    interpretation: null,
    panoramas: ['Mastcam-Z 360 #25 Belva crater...'],
    meda: null,
  },
  P7: {
    inArea: false,
    caption:
      'Bunsen Peak in the margin unit: NASA lists the Comet Geyser core as silica-cemented carbonate; a lakeshore origin is debated.',
    interpretation: null,
    panoramas: ['Mastcam-Z 360 #37 Bunsen Peak and Neretva Vallis'],
    meda: null,
  },
  P8: {
    inArea: false,
    caption:
      "Bright Angel / Cheyava Falls: light-toned rock with 'leopard spots'; a potential biosignature that needs laboratory confirmation on Earth (Hurowitz et al. 2025).",
    interpretation: null,
    panoramas: [
      'Mastcam-Z 360 #39 Bright Angel outcrop (Cheyava Falls ~110 m away)',
      'Cheyava Falls workspace mosaic',
    ],
    meda: null,
  },
  P9_optional: {
    inArea: false,
    caption:
      'Crater rim at Witch Hazel Hill, about 650 m higher than the landing site (JPL elevations): ancient crustal rocks; NASA lists the Green Gardens core as serpentinite.',
    interpretation: null,
    panoramas: ['Mastcam-Z 360 #44 Broom Point', 'Mastcam-Z 360 #41 Lookout Hill rim crest (Gigapan)'],
    meda: null,
  },
};

function canonicalPoiId(id: string): string {
  switch (id) {
    case 'poi-p3':
    case 'wildcat':
      return 'P3';
    case 'poi-p4':
    case 'nukshak':
      return 'P4';
    case 'poi-p5':
      return 'P5';
    case 'P9':
      return 'P9_optional';
    default:
      return id;
  }
}

function lookupPoi(id: string): KnownPoi | null {
  const known = KNOWN_POIS[canonicalPoiId(id)];
  return known ?? null;
}

/** Relative Jezero photo paths only. Schemes, `//`, backslashes, and `..` are rejected. */
export function isAllowedPhotoUrl(url: string | null | undefined): url is string {
  if (url === null || url === undefined || url.length === 0) {
    return false;
  }
  if (url.includes('\\') || url.includes('..') || url.includes('//') || url.includes(':')) {
    return false;
  }
  return PHOTO_URL_PATTERN.test(url);
}

export function safePhotoUrl(url: string | null | undefined): string | null {
  if (!isAllowedPhotoUrl(url)) {
    return null;
  }
  return url;
}

/** Science stops P3, P4, and P5 are never fictional. The outpost (`outpost` or `base`) is. */
export function isFictionalOutpost(id: string, kind: string): boolean {
  if (NEVER_FICTIONAL_IDS.has(id)) {
    return false;
  }
  return kind === 'outpost' || kind === 'base' || id === 'base';
}

export function shortLayerLabel(labelOrId: string): string {
  const trimmed = labelOrId.trim();
  switch (trimmed) {
    case 'ortho':
    case 'Ortho':
      return 'Ortho';
    case 'slope':
    case 'Slope':
      return 'Slope';
    case 'minerals':
    case 'Minerals':
      return 'Minerals';
    case 'thermal':
    case 'Thermal':
      return 'Thermal';
    default:
      break;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('thermal') || lower.includes('themis')) {
    return 'Thermal';
  }
  if (lower.includes('mineral') || lower.includes('crism')) {
    return 'Minerals';
  }
  if (lower.includes('slope')) {
    return 'Slope';
  }
  if (lower.includes('ortho') || lower.includes('hirise')) {
    return 'Ortho';
  }
  return trimmed;
}

export function formatDegrees(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1)}°`;
}

/** Areoid metres, including normal negative Jezero elevations. Not a kilometre switch. */
export function formatAreoidMetres(metres: number): string {
  if (!Number.isFinite(metres)) {
    return '—';
  }
  return `${metres.toFixed(1)} m`;
}

function formatLocalMetres(metres: number): string {
  if (!Number.isFinite(metres)) {
    return '—';
  }
  return `${metres.toFixed(2)} m`;
}

export function routeProgressLabel(progressFraction: number, leg: WristLeg): string {
  const name = leg === 'return' ? 'Return leg progress' : 'Route progress';
  if (!Number.isFinite(progressFraction)) {
    return `${name}: —`;
  }
  const clamped = Math.min(1, Math.max(0, progressFraction));
  return `${name}: ${Math.round(clamped * 100).toString()}%`;
}

/** Plain-language exclusion phrase from the English caption legend. */
export function exclusionPhrase(code: number): string {
  switch (code) {
    case 1:
      return 'missing elevation';
    case 2:
      return 'slope or roughness not computable';
    case 3:
      return 'outside the mapped data';
    case 4:
      return 'a manual exclusion';
    default:
      return 'an exclusion the route model cannot cross';
  }
}

/** The only three corridor reasons. No other hazard string is invented here. */
export function offPathPlainLanguage(detail: OffPathDetail): string {
  switch (detail.reason) {
    case 'steep-slope': {
      const slope = detail.slopeDeg;
      if (slope !== undefined && slope !== null && Number.isFinite(slope)) {
        return `The physical slope is ${formatDegrees(slope)}, above the ${SLOPE_GATE_DEG.toString()}° gate. This step was refused.`;
      }
      return `The physical slope is above the ${SLOPE_GATE_DEG.toString()}° gate. This step was refused.`;
    }
    case 'excluded-cell': {
      const code = detail.exclusionCode;
      const phrase =
        code === undefined || code === null ? 'an excluded cell' : exclusionPhrase(code);
      return `This cell cannot be entered: ${phrase}. This step was refused.`;
    }
    case 'corridor-deviation': {
      const deviation = detail.deviation_m;
      if (deviation !== undefined && deviation !== null && Number.isFinite(deviation)) {
        return `Horizontal distance from the route is ${formatDistance(Math.abs(deviation))}. This step was refused.`;
      }
      return 'The step leaves the route corridor. This step was refused.';
    }
    default: {
      const unexpected: never = detail.reason;
      return unexpected;
    }
  }
}

function publishedTenth(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1)} °C`;
}

/** Historical MEDA reading for one sol. Keeps the published tenth of a degree. */
export function medaNote(sol: number, minC: number, maxC: number): string {
  const solText = Number.isFinite(sol) ? Math.round(sol).toString() : '—';
  return `On sol ${solText}, MEDA measured air temperature from ${publishedTenth(minC)} to ${publishedTenth(maxC)} on that sol only.`;
}

function readMeda(
  poi: PoiCaptionSource,
  known: KnownPoi | null,
): { sol: number; minC: number; maxC: number } | null {
  if (poi.meda !== undefined && poi.meda !== null) {
    return poi.meda;
  }
  if (poi.medaTempC !== undefined && poi.medaTempC !== null) {
    return { sol: poi.medaTempC.sol, minC: poi.medaTempC.min, maxC: poi.medaTempC.max };
  }
  return known?.meda ?? null;
}

function resolveInArea(poi: PoiCaptionSource, known: KnownPoi | null): boolean {
  if (typeof poi.inArea === 'boolean') {
    return poi.inArea;
  }
  if (known !== null) {
    return known.inArea;
  }
  return true;
}

export function poiCaption(poi: PoiCaptionSource): PoiCaption {
  const known = lookupPoi(poi.id);
  const inArea = resolveInArea(poi, known);
  const fictional = isFictionalOutpost(poi.id, poi.kind);
  const lines: string[] = [];
  if (!inArea) {
    lines.push(CONTEXT_ONLY);
  }
  const summary = poi.summary.trim();
  if (summary.length > 0) {
    lines.push(summary);
  } else if (known !== null) {
    lines.push(known.caption);
  }
  const interpretation = poi.interpretation ?? known?.interpretation ?? null;
  if (interpretation !== null && interpretation.length > 0 && !lines.includes(interpretation)) {
    lines.push(interpretation);
  }
  const joined = lines.join(' ');
  if (joined.toLowerCase().includes('organic') && !joined.includes(LIFE_CAVEAT)) {
    lines.push(LIFE_CAVEAT);
  }
  const panoramas = poi.panoramas ?? known?.panoramas ?? [];
  for (const name of panoramas) {
    if (name.length > 0) {
      lines.push(`Panorama: ${name}`);
    }
  }
  const meda = readMeda(poi, known);
  if (meda !== null) {
    lines.push(medaNote(meda.sol, meda.minC, meda.maxC));
  }
  if (fictional && !joined.toLowerCase().includes('fictional')) {
    lines.push('The outpost is fictional.');
  }
  const title = poi.name.trim().length > 0 ? poi.name.trim() : (known?.caption ?? poi.id);
  return {
    title,
    lines,
    fictional,
    walkOffered: inArea,
    photoUrl: safePhotoUrl(poi.photoUrl),
  };
}

export function legendEntries(): readonly LegendEntry[] {
  return [
    {
      id: 'elevation',
      name: 'Elevation',
      units: 'm',
      text: 'Height in metres relative to the Mars reference surface (areoid). Negative values are normal: the Jezero floor is about 2.5 km below the reference.',
    },
    {
      id: 'slope',
      name: 'Slope',
      units: '°',
      text: 'Terrain slope in degrees from the HiRISE 1 m terrain model. 0° = flat. In this area 48% of cells are under 5° and 3% are 25° or steeper. The current map hatches cells steeper than 25°.',
    },
    {
      id: 'roughness',
      name: 'Roughness',
      units: 'm',
      text: 'How much the ground departs from a flat plane over about 5 m (RMS, metres). Not a rock or hazard map.',
    },
    {
      id: 'quality',
      name: 'Data quality',
      units: 'class',
      text: 'Unknown (3) everywhere: the source publishes no per-pixel quality. 0 = no elevation.',
    },
    {
      id: 'exclusion',
      name: 'Excluded cells',
      units: 'code',
      text: 'Cells the data cannot support: 1 missing elevation, 2 slope/roughness not computable, 3 outside data, 4 manual. None in this version. Slope limits are set by the route model, not here.',
    },
    {
      id: 'texture',
      name: 'Orbital image',
      units: '',
      text: 'HiRISE grayscale image (USGS orthomosaic), about 0.5 m per pixel as displayed. For context only.',
    },
  ];
}

export function limitationLines(): readonly string[] {
  return [
    '1 m terrain grid: individual boulders are not resolved.',
    'No per-pixel data quality is published; strict quality mode is off.',
    'Science-stop positions are where the rover stood, not the exact rock.',
    'Temperatures are for one Martian day and season, not permanent values.',
    'Weather, radiation, dust and communications are not modelled.',
    'Routes are a terrain demonstration, not mission-certified paths.',
  ];
}

export function coarseModeLine(): string {
  return 'COARSE 20 m terrain (CTX) — regional demonstration only, not for astronaut-scale navigation.';
}

export function captionSourceLines(): readonly string[] {
  return [
    'Terrain: USGS Astrogeology, Mars 2020 TRN HiRISE DTM Mosaic, 1 m (Fergason et al. 2020, doi:10.5066/P9REJ9JN), CC0 1.0.',
    'Image: USGS Astrogeology, Mars 2020 TRN HiRISE Orthorectified Image Mosaic (doi:10.5066/P9QJDP48), CC0 1.0; HiRISE images: NASA/JPL/University of Arizona (public domain).',
    'Coarse fallback: USGS Astrogeology, Mars 2020 TRN CTX DTM Mosaic, 20 m (doi:10.5066/P906QQT8) and CTX orthomosaic (doi:10.5066/P9GV1ND3), CC0 1.0; CTX: NASA/JPL-Caltech/MSSS.',
    'Science stops: NASA/JPL-Caltech Mars 2020 rover waypoints. Panoramas: NASA/JPL-Caltech/ASU/MSSS (Mastcam-Z team, free use without explicit permission). Temperatures: MEDA, NASA PDS Atmospheres Node (doi:10.17189/1522849, CC0 1.0).',
  ];
}

export function creditsLineEn(): string {
  return 'Data: USGS Astrogeology Science Center · HiRISE: NASA/JPL/University of Arizona · CTX: NASA/JPL-Caltech/MSSS · Rover positions: NASA/JPL-Caltech · Panoramas: NASA/JPL-Caltech/ASU/MSSS · Temperatures: MEDA / NASA PDS. No endorsement by NASA, JPL or USGS implied.';
}

export function mineralShiftCredit(): string {
  return 'CRISM observation FRT00005C5E has no DOI in the licence register. The mineral registration offset shiftM [-180, 204] is already applied in minerals.png (about 272 m). It is not applied again to coordinates, texture UVs, or points of interest. THEMIS nighttime thermal inertia has no DOI in the licence register.';
}

export function productDisclaimers(): readonly string[] {
  return [
    'Educational simulation. This product is a classroom model, not a NASA, JPL, or USGS mission tool.',
    'The outpost is fictional. It is a scenario choice for this simulation, not a NASA facility.',
    'Science stops in the mapped area are published rover locations and are not fictional.',
  ];
}

export function datasetCredits(): readonly DatasetCredit[] {
  return [
    {
      id: 'hirise_dtm_mosaic_1m',
      title: 'HiRISE DTM mosaic',
      doi: '10.5066/P9REJ9JN',
      licence:
        "CC0 1.0 Universal (USGS: 'This work is marked with CC0 1.0 Universal'); Astropedia use constraint: 'Please cite authors'",
      creditLine: 'USGS Astrogeology Science Center; HiRISE: NASA/JPL/University of Arizona',
      citation:
        'Fergason, R.L., Galuszka, D.M., Hare, T.M., Mayer, D.P., Redding, B.L. (2020). Mars 2020 Terrain Relative Navigation HiRISE DTM Mosaic. U.S. Geological Survey. https://doi.org/10.5066/P9REJ9JN',
      urls: [
        'https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic',
        'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_hirise_dtm_mosaic',
        'https://uahirise.org/media/usage.php',
      ],
    },
    {
      id: 'hirise_orthomosaic_25cm',
      title: 'HiRISE orthomosaic',
      doi: '10.5066/P9QJDP48',
      licence:
        "CC0 1.0 Universal (USGS data release page, Rights field); underlying HiRISE images public domain (UA HiRISE Image Usage Policy: 'there is no copyright restriction ... within the public domain')",
      creditLine: 'USGS Astrogeology Science Center; Image: NASA/JPL/University of Arizona',
      citation:
        'Fergason, R.L., Galuszka, D.M., Hare, T.M., Mayer, D.P., Redding, B.L. (2020). Mars 2020 Terrain Relative Navigation HiRISE Orthorectified Image Mosaic. U.S. Geological Survey. https://doi.org/10.5066/P9QJDP48',
      urls: [
        'https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-orthorectified-image-mosaic',
        'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_hirise_orthorectified_image_mosaic',
        'https://uahirise.org/media/usage.php',
      ],
    },
    {
      id: 'ctx_dtm_mosaic_20m',
      title: 'CTX DTM mosaic',
      doi: '10.5066/P906QQT8',
      licence:
        "CC0 1.0 Universal (USGS data release page, Rights field); Astropedia: Access constraints None, Use constraints 'Please cite authors'",
      creditLine: 'USGS Astrogeology Science Center; CTX: NASA/JPL-Caltech/MSSS',
      citation:
        'Fergason, R.L., Galuszka, D.M., Hare, T.M., Mayer, D.P., Redding, B.L. (2020). Mars 2020 Terrain Relative Navigation CTX DTM Mosaic. U.S. Geological Survey. https://doi.org/10.5066/P906QQT8',
      urls: [
        'https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-ctx-dtm-mosaic',
        'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic',
      ],
    },
    {
      id: 'ctx_orthomosaic_6m',
      title: 'CTX orthomosaic',
      doi: '10.5066/P9GV1ND3',
      licence:
        "CC0 1.0 Universal (USGS data release page, Rights field); CTX images public domain, MSSS: 'While the images are in the Public Domain, NASA/JPL-Caltech/MSSS requests that you credit the source'",
      creditLine: 'USGS Astrogeology Science Center; CTX: NASA/JPL-Caltech/MSSS',
      citation:
        'Fergason, R.L., Galuszka, D.M., Hare, T.M., Mayer, D.P., Redding, B.L. (2020). Mars 2020 Terrain Relative Navigation Context Camera Orthorectified Image Mosaic. U.S. Geological Survey. https://doi.org/10.5066/P9GV1ND3',
      urls: [
        'https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-context-camera-orthorectified-image-mosaic',
        'https://astrogeology.usgs.gov/search/map/Mars/Mars2020/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0',
        'https://www.msss.com/news/index.php?id=141',
      ],
    },
    {
      id: 'jpl_m20_waypoints',
      title: 'Rover waypoints',
      doi: null,
      licence:
        "No dataset-specific licence found on the file or MMGIS. General NASA Images and Media Usage Guidelines: NASA content 'generally [is] not subject to copyright in the United States' and may be used for educational/informational purposes; 'NASA should be acknowledged as the source of the material'; no implied endorsement. verified: partial.",
      creditLine: 'NASA/JPL-Caltech',
      citation:
        'NASA/JPL-Caltech, Mars 2020 rover waypoints (MMGIS), M20_waypoints.json, https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
      urls: [
        'https://www.nasa.gov/nasa-brand-center/images-and-media/',
        'https://www.jpl.nasa.gov/jpl-image-use-policy',
      ],
    },
    {
      id: 'mastcam_z_360_panoramas',
      title: 'Mastcam-Z panoramas',
      doi: null,
      licence:
        "Mastcam-Z team: 'These mosaics are available for public or scientific community use without the need for explicit permission.' No formal licence (e.g. CC) stated. 56th LPSC, Abstract #1719.",
      creditLine: 'NASA/JPL-Caltech/ASU/MSSS',
      citation:
        "Bell III, J.F. et al. & the Mastcam-Z Science and Operations Team (2025). Landscape Mosaics Acquired in Jezero Crater by the Mastcam-Z Investigation on the NASA Mars 2020 Mission's Perseverance Rover. 56th LPSC, Abstract #1719.",
      urls: ['https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/'],
    },
    {
      id: 'meda_pds',
      title: 'MEDA',
      doi: '10.17189/1522849',
      licence:
        "CC0 1.0 Universal and 'a work of the U.S. Government ... not subject to copyright protection in the United States. Foreign copyrights may apply.' (DataCite rights for DOI 10.17189/1522849)",
      creditLine:
        'MEDA: NASA PDS Atmospheres Node (Rodriguez-Manfredi & de la Torre Juarez 2021, doi:10.17189/1522849)',
      citation:
        'Rodriguez-Manfredi, J.A., de la Torre Juarez, M. (2021). Mars 2020 MEDA Bundle (v6.0). NASA Planetary Data System. https://doi.org/10.17189/1522849',
      urls: [
        'https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/bundle.xml',
        'https://api.datacite.org/dois/10.17189/1522849',
      ],
    },
  ];
}

export function debriefLines(summary: WalkDebriefSummary): readonly string[] {
  const elapsed = Number.isFinite(summary.elapsedSimSeconds)
    ? formatDuration(summary.elapsedSimSeconds)
    : '—';
  const speedLine = Number.isFinite(summary.speed_m_s)
    ? `Elapsed sim time ${elapsed} at an assumed ${summary.speed_m_s.toFixed(2)} m/s.`
    : `Elapsed sim time ${elapsed}. No speed assumption was supplied.`;
  const visited = Array.isArray(summary.poiIdsVisited) ? summary.poiIdsVisited : [];
  const names = visited.filter((id) => id.length > 0);
  const poiLine =
    names.length === 0
      ? 'Points of interest visited: none recorded.'
      : `Points of interest visited: ${names.join(', ')}.`;
  return [
    speedLine,
    `Traverse length ${formatDistance(summary.traverseLength_m)}.`,
    `Ascent ${formatDistance(summary.ascent_m)}. Descent ${formatDistance(summary.descent_m)}.`,
    `Physical slope from ${formatDegrees(summary.minSlope_deg)} to ${formatDegrees(summary.maxSlope_deg)}.`,
    poiLine,
  ];
}

export function wristLines(snapshot: WristSnapshot): readonly string[] {
  const lines: string[] = [
    `East ${formatLocalMetres(snapshot.east_m)}`,
    `North ${formatLocalMetres(snapshot.north_m)}`,
    `Elevation ${formatAreoidMetres(snapshot.elevation_m)} areoid`,
    Number.isFinite(snapshot.slopeDeg)
      ? `Physical slope ${formatDegrees(snapshot.slopeDeg)}`
      : 'Physical slope unavailable',
    'Slope is the physical value, not the exaggerated view.',
    routeProgressLabel(snapshot.progressFraction, snapshot.leg ?? 'outbound'),
    snapshot.candidateId === null || snapshot.candidateId.length === 0
      ? 'No route selected'
      : `Route ${snapshot.candidateId}`,
    `Layer ${shortLayerLabel(snapshot.layer)}`,
  ];
  if (snapshot.offPath) {
    lines.push('✕ OFF-PATH BLOCKED. This step was refused.');
  }
  if (snapshot.dottedHit !== null) {
    lines.push(
      `${snapshot.dottedHit.label}: ${snapshot.dottedHit.reason} (${formatDistance(snapshot.dottedHit.distance_m)} away).`,
    );
  }
  if (snapshot.nearbyPoi !== null) {
    const caption = poiCaption(snapshot.nearbyPoi);
    lines.push(caption.title);
    for (const line of caption.lines) {
      lines.push(line);
    }
  }
  if (snapshot.arrival !== null) {
    for (const line of debriefLines(snapshot.arrival)) {
      lines.push(line);
    }
  }
  return lines;
}

function paintLineList(ctx: CanvasRenderingContext2D, lines: readonly string[]): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (!(width > 0) || !(height > 0)) {
    return;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#14110e';
  ctx.fillRect(0, 0, width, height);
  roundRect(ctx, 8, 8, Math.max(0, width - 16), Math.max(0, height - 16), 10);
  ctx.strokeStyle = '#f6f1e7';
  ctx.stroke();
  ctx.fillStyle = '#f6f1e7';
  ctx.font = '16px sans-serif';
  ctx.textBaseline = 'top';
  let y = 20;
  const maxWidth = Math.max(16, width - 40);
  for (const line of lines) {
    const wrapped = wrapText(ctx, line, maxWidth);
    const rows = wrapped.length > 0 ? wrapped : [line];
    for (const row of rows) {
      if (y > height - 18) {
        return;
      }
      drawText(ctx, row, 20, y, maxWidth);
      y += 20;
    }
  }
}

export function paintWristCanvas(ctx: CanvasRenderingContext2D | null, snapshot: WristSnapshot): void {
  if (ctx === null) {
    return;
  }
  try {
    paintLineList(ctx, wristLines(snapshot));
  } catch {
    return;
  }
}

export function paintDebriefCanvas(ctx: CanvasRenderingContext2D | null, summary: WalkDebriefSummary): void {
  if (ctx === null) {
    return;
  }
  try {
    paintLineList(ctx, debriefLines(summary));
  } catch {
    return;
  }
}

export function paintLegendCanvas(ctx: CanvasRenderingContext2D | null): void {
  if (ctx === null) {
    return;
  }
  const lines = legendEntries().map((entry) =>
    entry.units.length > 0 ? `${entry.name} (${entry.units}): ${entry.text}` : `${entry.name}: ${entry.text}`,
  );
  try {
    paintLineList(ctx, lines);
  } catch {
    return;
  }
}
