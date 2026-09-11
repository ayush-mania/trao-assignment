// Provider-agnostic LLM contract. Providers do one thing: turn a request into text or a typed error.
// Retry, rate limiting, failover and JSON parsing live in LlmClient, not in providers.

export interface CompletionRequest {
  system: string;
  user: string;
  /** Ask the provider for a JSON object response (all our calls are JSON). */
  json: boolean;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Default output budget; the limiter and both providers must agree on it. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

export type LlmErrorKind = 'rate_limit' | 'server' | 'network' | 'auth' | 'bad_request' | 'empty';

export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly provider: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
  /** rate_limit / server / network / empty are worth retrying; auth / bad_request are not. */
  get retryable(): boolean {
    return (
      this.kind === 'rate_limit' ||
      this.kind === 'server' ||
      this.kind === 'network' ||
      this.kind === 'empty'
    );
  }
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/** Rough token estimate used for the TPM budget. 4 chars/token is the usual English heuristic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
