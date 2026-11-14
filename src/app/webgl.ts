/** WebGL capability probe used before loading the 3D chunk. OWNER: Role C. */
export type WebGLSupport = { ok: true; version: 1 | 2 } | { ok: false; reason: string };

export function detectWebGL(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): WebGLSupport {
  if (!doc) return { ok: false, reason: 'No document (non-browser environment).' };
  try {
    const canvas = doc.createElement('canvas');
    const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    const gl = gl2 ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return { ok: false, reason: 'This browser or device does not provide WebGL (it may be disabled or blocked).' };
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context immediately
    return { ok: true, version: gl2 ? 2 : 1 };
  } catch (e) {
    return { ok: false, reason: `WebGL initialisation failed: ${(e as Error).message}` };
  }
}
