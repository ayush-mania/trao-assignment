// LlmClient: the only thing the pipeline talks to. Adds, on top of a provider chain:
// self rate limiting, exponential backoff honouring Retry-After, provider failover (Gemini → Groq),
// schema-locked JSON with one repair round-trip. Deterministic under test via injected sleep/now.
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

export interface LlmClientOptions {
  providers: LlmProvider[];
  requestsPerMinute: number;
  tokensPerMinute: number;
  /** Attempts per provider before failing over (default 4). */
  maxAttemptsPerProvider?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onEvent?: (e: LlmEvent) => void;
}

export type LlmEvent =
  | { type: 'retry'; provider: string; attempt: number; waitMs: number; reason: string }
  | { type: 'failover'; from: string; to: string; reason: string }
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
  private readonly limiter: RateLimiter;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onEvent: (e: LlmEvent) => void;

  constructor(opts: LlmClientOptions) {
    if (opts.providers.length === 0) throw new Error('LlmClient needs at least one provider');
    this.providers = opts.providers;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.limiter = new RateLimiter({
      requestsPerMinute: opts.requestsPerMinute,
      tokensPerMinute: opts.tokensPerMinute,
      sleep: this.sleep,
      ...(opts.now ? { now: opts.now } : {}),
    });
    this.maxAttempts = opts.maxAttemptsPerProvider ?? 4;
    this.baseBackoffMs = opts.baseBackoffMs ?? 2_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 60_000;
    this.onEvent = opts.onEvent ?? (() => {});
  }

  get primary(): LlmProvider {
    return this.providers[0]!;
  }

  /** Raw completion with limiter + retry + failover. */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let lastError: LlmError | undefined;
    for (let p = 0; p < this.providers.length; p++) {
      const provider = this.providers[p]!;
      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        await this.limiter.acquire(
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
          this.onEvent({ type: 'retry', provider: provider.name, attempt, waitMs, reason: e.kind });
          await this.sleep(waitMs);
        }
      }
      const next = this.providers[p + 1];
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
