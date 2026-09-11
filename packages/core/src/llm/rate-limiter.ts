// Sliding-window limiter for requests/minute and tokens/minute. Free tiers cap both (brief p.1),
// so we throttle ourselves before the provider does; 429s are still handled by the client.

export interface RateLimiterOptions {
  requestsPerMinute: number;
  tokensPerMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private readonly rpm: number;
  private readonly tpm: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly window: { at: number; tokens: number }[] = [];

  constructor(opts: RateLimiterOptions) {
    // NaN (e.g. LLM_TPM=200k) would make every comparison false and acquire() spin forever.
    this.rpm = Number.isFinite(opts.requestsPerMinute) ? Math.max(1, opts.requestsPerMinute) : 8;
    this.tpm = Number.isFinite(opts.tokensPerMinute) ? Math.max(1, opts.tokensPerMinute) : 200_000;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Waits until a request of `tokens` fits in the current 60s window, then records it. */
  async acquire(tokens: number): Promise<void> {
    for (;;) {
      const wait = this.waitFor(tokens);
      if (wait <= 0) break;
      await this.sleep(wait);
    }
    this.window.push({ at: this.now(), tokens: Math.min(tokens, this.tpm) });
  }

  /** ms to wait before `tokens` would fit; 0 if it fits now. */
  waitFor(tokens: number): number {
    // A single request larger than the whole budget can never fit; let it through on an empty
    // window rather than hanging (the provider's own 429 is handled by the client).
    tokens = Math.min(tokens, this.tpm);
    const t = this.now();
    while (this.window.length > 0 && this.window[0]!.at <= t - 60_000) this.window.shift();
    const used = this.window.reduce((s, e) => s + e.tokens, 0);
    if (this.window.length < this.rpm && used + tokens <= this.tpm) return 0;
    const oldest = this.window[0]?.at ?? t;
    return Math.max(1, oldest + 60_000 - t);
  }
}
