export type MutexTaskContext = {
  readonly epoch: number;
  isCancelled: () => boolean;
};

export type UnifiedDeadline = {
  readonly startMs: number;
  readonly deadlineMs: number;
  isTimedOut: () => boolean;
  elapsedMs: () => number;
};

/**
 * Single-active-owner workspace mutex with immediate epoch cancellation
 * and serialized FIFO execution across yielded async tasks.
 */
export class AsyncWorkspaceMutex {
  private activeTaskEpoch = 0;
  private activeRequestId: string | null = null;
  private queueChain: Promise<void> = Promise.resolve();

  public getCurrentEpoch(): number {
    return this.activeTaskEpoch;
  }

  public cancelRequest(requestId: string): boolean {
    if (this.activeRequestId === requestId) {
      this.activeTaskEpoch++;
      this.activeRequestId = null;
      return true;
    }
    return false;
  }

  public supersedeAndEnqueue<T>(
    requestId: string | null,
    task: (context: MutexTaskContext) => Promise<T> | T
  ): Promise<T> {
    const myEpoch = ++this.activeTaskEpoch;
    this.activeRequestId = requestId;
    const isCancelled = () => this.activeTaskEpoch !== myEpoch;

    const runPromise = this.queueChain.then(() =>
      task({ epoch: myEpoch, isCancelled })
    );

    this.queueChain = runPromise.then(
      () => undefined,
      () => undefined
    );

    return runPromise;
  }
}

/**
 * Creates a macrotask yield helper backed by MessageChannel with a timer fallback.
 */
export function createYieldChannel(): () => Promise<void> {
  return () => {
    if (typeof MessageChannel !== 'undefined') {
      return new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.onmessage = null;
          channel.port1.close();
          channel.port2.close();
          resolve();
        };
        channel.port2.postMessage(undefined);
      });
    }
    if (typeof setImmediate !== 'undefined') {
      return new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  };
}

/**
 * Creates a single shared deadline across component labeling, policy solves, and metrics.
 */
export function createUnifiedDeadline(
  timeoutMs = 5000,
  nowFn: () => number = () => performance.now()
): UnifiedDeadline {
  const startMs = nowFn();
  const deadlineMs = startMs + timeoutMs;

  return {
    startMs,
    deadlineMs,
    isTimedOut: () => nowFn() >= deadlineMs,
    elapsedMs: () => Math.max(0, nowFn() - startMs),
  };
}
