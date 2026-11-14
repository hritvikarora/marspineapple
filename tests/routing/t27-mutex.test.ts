import { describe, expect, it } from 'vitest';
import {
  AsyncWorkspaceMutex,
  createUnifiedDeadline,
  createYieldChannel,
} from '../../src/routing/mutex.js';

describe('T27: AsyncWorkspaceMutex, yield channel, and unified deadline', () => {
  it('Finding 5 Regression: Task B cannot start until suspended Task A wakes, observes isCancelled, and exits', async () => {
    const mutex = new AsyncWorkspaceMutex();
    const yieldToEventLoop = createYieldChannel();
    const sharedWorkspace = new Int32Array(4);
    const events: string[] = [];

    const taskAPromise = mutex.supersedeAndEnqueue('req-A', async (ctx) => {
      events.push('A:start');
      sharedWorkspace[0] = 101;
      expect(ctx.isCancelled()).toBe(false);

      await yieldToEventLoop();

      // Task B superseded A while A was suspended, yet B has NOT touched sharedWorkspace yet
      expect(ctx.isCancelled()).toBe(true);
      expect(sharedWorkspace[0]).toBe(101);
      events.push('A:cancelled_after_yield');
      return 'A_CANCELLED';
    });

    // Wait one microtask so Task A enters and reaches its MessageChannel yield
    await Promise.resolve();
    expect(events).toEqual(['A:start']);

    const taskBPromise = mutex.supersedeAndEnqueue('req-B', async (ctx) => {
      events.push('B:start');
      expect(ctx.isCancelled()).toBe(false);
      // Task A must have exited before Task B started
      expect(events).toEqual(['A:start', 'A:cancelled_after_yield', 'B:start']);
      sharedWorkspace[0] = 202;
      await yieldToEventLoop();
      expect(ctx.isCancelled()).toBe(false);
      events.push('B:done');
      return 'B_DONE';
    });

    const [resA, resB] = await Promise.all([taskAPromise, taskBPromise]);
    expect(resA).toBe('A_CANCELLED');
    expect(resB).toBe('B_DONE');
    expect(sharedWorkspace[0]).toBe(202);
    expect(events).toEqual([
      'A:start',
      'A:cancelled_after_yield',
      'B:start',
      'B:done',
    ]);
  });

  it('cancelRequest increments epoch only when requestId matches active request', async () => {
    const mutex = new AsyncWorkspaceMutex();
    const yieldToEventLoop = createYieldChannel();
    const initialEpoch = mutex.getCurrentEpoch();

    expect(mutex.cancelRequest('nonexistent')).toBe(false);
    expect(mutex.getCurrentEpoch()).toBe(initialEpoch);

    const p = mutex.supersedeAndEnqueue('req-1', async (ctx) => {
      await yieldToEventLoop();
      return ctx.isCancelled();
    });

    await Promise.resolve();
    expect(mutex.cancelRequest('wrong-id')).toBe(false);
    expect(mutex.cancelRequest('req-1')).toBe(true);
    expect(mutex.cancelRequest('req-1')).toBe(false);
    expect(await p).toBe(true);
  });

  it('createUnifiedDeadline tracks elapsed time and deadline expiry deterministically', () => {
    let now = 1000;
    const deadline = createUnifiedDeadline(250, () => now);

    expect(deadline.deadlineMs).toBe(1250);
    expect(deadline.elapsedMs()).toBe(0);
    expect(deadline.isTimedOut()).toBe(false);

    now = 1249;
    expect(deadline.elapsedMs()).toBe(249);
    expect(deadline.isTimedOut()).toBe(false);

    now = 1250;
    expect(deadline.elapsedMs()).toBe(250);
    expect(deadline.isTimedOut()).toBe(true);
  });
});
