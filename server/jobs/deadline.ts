export class DeadlineExceeded extends Error {
  constructor() {
    super('deadline exceeded')
  }
}

/** Time budget of one job run; handlers check it between atomic steps and stop cleanly. */
export class Deadline {
  private cancelled = false
  private readonly end: number
  constructor(
    readonly budgetMs: number,
    private now: () => number = Date.now,
  ) {
    this.end = now() + budgetMs
  }
  get remainingMs() {
    return Math.max(0, this.end - this.now())
  }
  get expired() {
    return this.cancelled || this.remainingMs === 0
  }
  cancel() {
    this.cancelled = true
  }
  canStart(neededMs: number) {
    return !this.cancelled && this.remainingMs >= neededMs
  }
  check() {
    if (this.expired) throw new DeadlineExceeded()
  }
}
