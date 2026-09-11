// LlmClient: the only thing the pipeline talks to. Adds, on top of a provider chain:
// self rate limiting, exponential backoff honouring Retry-After, provider failover (Gemini → Groq)
// with cooldown, schema-locked JSON with one repair round-trip. Deterministic under test via
// injected sleep/now.
import type { ZodType } from 'zod';
import { extractJson } from './json.js';
import { RateLimiter } from './rate-limiter.js';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  estimateTokens,
  LlmError,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
} from './types.js';

export interface ProviderLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export interface LlmClientOptions {
  providers: LlmProvider[];
  /** Default budget per provider. */
  requestsPerMinute: number;
  tokensPerMinute: number;
  /** Per-provider overrides keyed by provider name (free tiers differ a lot). */
  limits?: Record<string, Partial<ProviderLimits>>;
  /** Attempts per provider before failing over (default 4). */
  maxAttemptsPerProvider?: number;
  /**
   * When a provider asks us to wait at least this long (Retry-After) and another provider is
   * available, fail over at once and put the provider in cooldown instead of sleeping (default 10s).
   * Observed 2026-09-11: Gemini free tier answered 45-59s on most calls while Groq was healthy.
   */
  failoverAfterMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onEvent?: (e: LlmEvent) => void;
}

export type LlmEvent =
  | { type: 'retry'; provider: string; attempt: number; waitMs: number; reason: string }
  | { type: 'failover'; from: string; to: string; reason: string }
  | { type: 'cooldown'; provider: string; untilMs: number }
  | { type: 'repair'; provider: string; reason: string };

export interface JsonRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
}

export class LlmClient {
  private readonly providers: LlmProvider[];
  /** One budget per provider: Groq being idle must not be throttled by Gemini's calls. */
  private readonly limiters = new Map<string, RateLimiter>();
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly failoverAfterMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly onEvent: (e: LlmEvent) => void;
  /** provider name → epoch ms until which it should be skipped when a fallback exists. */
  private readonly cooldownUntil = new Map<string, number>();

  constructor(opts: LlmClientOptions) {
    if (opts.providers.length === 0) throw new Error('LlmClient needs at least one provider');
    this.providers = opts.providers;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
    for (const p of opts.providers) {
      const o = opts.limits?.[p.name] ?? {};
      this.limiters.set(
        p.name,
        new RateLimiter({
          requestsPerMinute: o.requestsPerMinute ?? opts.requestsPerMinute,
          tokensPerMinute: o.tokensPerMinute ?? opts.tokensPerMinute,
          sleep: this.sleep,
          now: this.now,
        }),
      );
    }
    this.maxAttempts = opts.maxAttemptsPerProvider ?? 4;
    this.baseBackoffMs = opts.baseBackoffMs ?? 2_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 60_000;
    this.failoverAfterMs = opts.failoverAfterMs ?? 10_000;
    this.onEvent = opts.onEvent ?? (() => {});
  }

  get primary(): LlmProvider {
    return this.providers[0]!;
  }

  /** Raw completion with limiter + retry + failover. */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let lastError: LlmError | undefined;
    // Providers in cooldown go last, so a healthy fallback is tried first without waiting.
    const order = [...this.providers].sort((a, b) => this.cooldownLeft(a) - this.cooldownLeft(b));
    for (let p = 0; p < order.length; p++) {
      const provider = order[p]!;
      const hasFallback = p < order.length - 1;
      const left = this.cooldownLeft(provider);
      if (left > 0 && hasFallback) continue;
      if (left > 0) await this.sleep(left);
      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        await this.limiters
          .get(provider.name)!
          .acquire(
            estimateTokens(req.system + req.user) +
              (req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
          );
        try {
          return await provider.complete(req);
        } catch (err) {
          const e = toLlmError(err, provider.name);
          lastError = e;
          if (!e.retryable || attempt === this.maxAttempts) break;
          const waitMs = Math.min(
            this.maxBackoffMs,
            e.retryAfterMs ?? this.baseBackoffMs * 2 ** (attempt - 1),
          );
          // A provider answering 5xx repeatedly is down for now; one retry, then try the next one.
          if (hasFallback && e.kind === 'server' && attempt >= 2) break;
          if (hasFallback && e.kind === 'rate_limit' && waitMs >= this.failoverAfterMs) {
            const untilMs = this.now() + waitMs;
            this.cooldownUntil.set(provider.name, untilMs);
            this.onEvent({ type: 'cooldown', provider: provider.name, untilMs });
            break;
          }
          this.onEvent({ type: 'retry', provider: provider.name, attempt, waitMs, reason: e.kind });
          await this.sleep(waitMs);
        }
      }
      const next = order[p + 1];
      if (next && lastError) {
        this.onEvent({
          type: 'failover',
          from: provider.name,
          to: next.name,
          reason: lastError.kind,
        });
      }
    }
    throw lastError ?? new LlmError('server', 'no provider succeeded', 'none');
  }

  /**
   * Schema-locked JSON completion. If the model's JSON does not parse or fails the schema,
   * one repair round-trip re-asks with the concrete error; a second failure throws.
   */
  async completeJson<T>(req: JsonRequest<T>): Promise<{ data: T; result: CompletionResult }> {
    const base: CompletionRequest = {
      system: req.system,
      user: req.user,
      json: true,
      ...(req.maxOutputTokens !== undefined ? { maxOutputTokens: req.maxOutputTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };
    const first = await this.complete(base);
    const parsed = tryParse(req.schema, first.text);
    if (parsed.ok) return { data: parsed.data, result: first };

    this.onEvent({ type: 'repair', provider: first.provider, reason: parsed.error });
    const second = await this.complete({
      ...base,
      user:
        `${req.user}\n\nYour previous answer was rejected: ${parsed.error}\n` +
        `Previous answer:\n${first.text.slice(0, 4000)}\n\nReturn only a corrected JSON object.`,
    });
    const again = tryParse(req.schema, second.text);
    if (again.ok) return { data: again.data, result: second };
    throw new LlmError(
      'bad_request',
      `model output failed schema twice: ${again.error}`,
      second.provider,
    );
  }

  private cooldownLeft(provider: LlmProvider): number {
    return Math.max(0, (this.cooldownUntil.get(provider.name) ?? 0) - this.now());
  }
}

function tryParse<T>(
  schema: ZodType<T>,
  text: string,
): { ok: true; data: T } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (err) {
    return { ok: false, error: `invalid JSON (${(err as Error).message})` };
  }
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const msg = r.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `schema violation (${msg})` };
}

function toLlmError(err: unknown, provider: string): LlmError {
  if (err instanceof LlmError) return err;
  return new LlmError('network', (err as Error)?.message ?? String(err), provider);
}
