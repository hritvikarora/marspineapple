import type { SolverWorkspacePort } from './types.js';

export class SolverWorkspace implements SolverWorkspacePort {
  public readonly capacity: number;
  public currentSearchId = 0;
  public readonly gScore: Float64Array;
  public readonly fScore: Float64Array;
  public readonly crossScore: Float64Array;
  public readonly parentIndex: Int32Array;
  public readonly seenStamp: Uint32Array;
  public readonly closedStamp: Uint32Array;
  public readonly heapNodes: Int32Array;
  public readonly heapPos: Int32Array;
  public readonly componentId: Int32Array;
  public readonly adjMask: Uint8Array;
  public readonly bfsQueue: Int32Array;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`Invalid SolverWorkspace capacity: ${capacity}`);
    }
    this.capacity = capacity;
    this.gScore = new Float64Array(capacity);
    this.fScore = new Float64Array(capacity);
    this.crossScore = new Float64Array(capacity);
    this.parentIndex = new Int32Array(capacity);
    this.seenStamp = new Uint32Array(capacity);
    this.closedStamp = new Uint32Array(capacity);
    this.heapNodes = new Int32Array(capacity);
    this.heapPos = new Int32Array(capacity).fill(-1);
    this.componentId = new Int32Array(capacity).fill(-1);
    this.adjMask = new Uint8Array(capacity);
    this.bfsQueue = new Int32Array(capacity);
  }

  public beginSearch(): number {
    this.currentSearchId = (this.currentSearchId + 1) >>> 0;
    if (this.currentSearchId === 0) {
      this.seenStamp.fill(0);
      this.closedStamp.fill(0);
      this.currentSearchId = 1;
    }
    return this.currentSearchId;
  }
}
