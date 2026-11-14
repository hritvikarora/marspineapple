/** Validated, in-memory region bundle (output of loadAndValidateBundle). OWNER: Role C. */
import type { RegionManifest } from './manifest';

/**
 * Typed raster views. Treat as IMMUTABLE on the main thread: the map, 3D view and worker all
 * read the same data. The worker client sends COPIES (never transfers these buffers), so they are
 * never detached.
 */
export interface GridBundle {
  manifest: RegionManifest;
  /** Convenience echo of manifest.bundleVersion. */
  bundleVersion: string;
  width: number;
  height: number;
  /** metres, NaN = missing */
  elevation: Float32Array;
  /** degrees, NaN = unsupported neighbourhood */
  slope: Float32Array;
  /** metres (detrended residual), NaN = unsupported */
  roughness: Float32Array;
  /** QualityCode per cell */
  quality: Uint8Array;
  /** ExclusionCode per cell */
  exclusion: Uint8Array;
  /** Whether SHA-256 hashes were verified (false when SubtleCrypto is unavailable, e.g. plain-http LAN). */
  hashesVerified: boolean;
}

/** Plain-data form posted to the worker (structured-clone friendly). */
export interface GridBundleTransfer {
  manifest: RegionManifest;
  bundleVersion: string;
  width: number;
  height: number;
  elevation: ArrayBuffer;
  slope: ArrayBuffer;
  roughness: ArrayBuffer;
  quality: ArrayBuffer;
  exclusion: ArrayBuffer;
}
