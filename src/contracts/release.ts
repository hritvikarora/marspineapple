/** Release identifier = app + bundle + model versions. Shown in UI, embedded in exports. */
export interface ReleaseId {
  appVersion: string;
  bundleVersion: string;
  modelVersion: string;
}

export function formatReleaseId(r: ReleaseId): string {
  return `app ${r.appVersion} · bundle ${r.bundleVersion} · model ${r.modelVersion}`;
}
