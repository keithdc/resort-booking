/**
 * @file apps/api/src/shared/concurrency/semaphore.spec.ts
 * @shared Semaphore
 */

import { Semaphore, SemaphoreFullError } from './semaphore';

function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = (): void => undefined;
  const promise = new Promise<void>((resolve): void => {
    open = resolve;
  });
  return { promise, open };
}

describe('Semaphore', () => {
  it('runs jobs and returns their result', async () => {
    await expect(new Semaphore(2, 2).run(async () => 'done')).resolves.toBe('done');
  });

  it('never runs more than the allowed number at once', async () => {
    const semaphore = new Semaphore(2, 10);
    let active = 0;
    let peak = 0;
    const g = gate();
    const job = async (): Promise<void> => {
      active += 1;
      peak = Math.max(peak, active);
      await g.promise;
      active -= 1;
    };

    const all = Promise.all([1, 2, 3, 4, 5].map(() => semaphore.run(job)));
    await Promise.resolve();
    g.open();
    await all;

    expect(peak).toBe(2);
  });

  it('refuses a job straight away once the queue is full', async () => {
    const semaphore = new Semaphore(1, 1);
    const g = gate();
    const first = semaphore.run(() => g.promise);
    const queued = semaphore.run(async () => 'queued');

    await expect(semaphore.run(async () => 'too many')).rejects.toBeInstanceOf(SemaphoreFullError);

    g.open();
    await first;
    await expect(queued).resolves.toBe('queued');
  });

  it('frees the slot when a job throws', async () => {
    const semaphore = new Semaphore(1, 0);

    await expect(semaphore.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    await expect(semaphore.run(async () => 'next')).resolves.toBe('next');
  });

  it('serves waiting jobs in the order they arrived', async () => {
    const semaphore = new Semaphore(1, 5);
    const order: number[] = [];
    const g = gate();
    const first = semaphore.run(async () => { await g.promise; order.push(0); });
    const second = semaphore.run(async () => { order.push(1); });
    const third = semaphore.run(async () => { order.push(2); });

    g.open();
    await Promise.all([first, second, third]);

    expect(order).toEqual([0, 1, 2]);
  });
});
