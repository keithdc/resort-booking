/**
 * @file apps/api/src/shared/concurrency/semaphore.ts
 * @shared Bounds how many slow jobs (password hashing) run at once, and how many may wait
 * @dependencies none
 */

/** Thrown when too many jobs are already waiting. */
export class SemaphoreFullError extends Error {
  public constructor() {
    super('Too many jobs are waiting');
    this.name = 'SemaphoreFullError';
  }
}

/**
 * At most `maxConcurrent` jobs run at once; up to `maxQueued` more wait their turn; beyond that a job is
 * refused straight away (SemaphoreFullError) instead of piling up and starving everything else.
 */
export class Semaphore {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {}

  /**
   * Runs `job` when a slot is free and always frees the slot afterwards, even if the job throws.
   */
  public async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueued) {
        throw new SemaphoreFullError();
      }
      await new Promise<void>((resolve): void => {
        this.waiting.push(resolve);
      });
    } else {
      this.running += 1;
    }
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next === undefined) {
        this.running -= 1;
      } else {
        next();
      }
    }
  }
}
