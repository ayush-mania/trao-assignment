// Builds the provider chain from environment variables documented in .env.example (D11, D17).
// Defaults are the free-tier numbers measured on 2026-09-11 (see README "LLM layer").
import { LlmClient, type LlmEvent } from './client.js';
import { GeminiProvider } from './gemini.js';
import { GroqProvider } from './groq.js';
import type { LlmProvider } from './types.js';

export type EnvLike = Record<string, string | undefined>;

export const DEFAULT_MODELS = {
  gemini: 'gemini-3.5-flash-lite', // 15 RPM free
  geminiFallback: 'gemma-4-26b-a4b-it', // ~30 RPM free, no thinking/JSON-mode config
  groq: 'openai/gpt-oss-120b', // 30 RPM but only 8k TPM free
} as const;

export function llmClientFromEnv(env: EnvLike, onEvent?: (e: LlmEvent) => void): LlmClient {
  const providers: LlmProvider[] = [];
  const limits: Record<string, { requestsPerMinute?: number; tokensPerMinute?: number }> = {};
  const num = (v: string | undefined, d: number) =>
    v && Number.isFinite(Number(v)) ? Number(v) : d;

  if (env.GEMINI_API_KEY) {
    const primary = new GeminiProvider({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL ?? DEFAULT_MODELS.gemini,
    });
    providers.push(primary);
    limits[primary.name] = {
      requestsPerMinute: num(env.GEMINI_RPM, 15),
      tokensPerMinute: num(env.GEMINI_TPM, 250_000),
    };
    const fallbackModel = env.GEMINI_FALLBACK_MODEL ?? DEFAULT_MODELS.geminiFallback;
    if (fallbackModel && fallbackModel !== primary.model) {
      const fallback = new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: fallbackModel });
      providers.push(fallback);
      limits[fallback.name] = {
        requestsPerMinute: num(env.GEMINI_FALLBACK_RPM, 30),
        tokensPerMinute: num(env.GEMINI_FALLBACK_TPM, 15_000),
      };
    }
  }
  if (env.GROQ_API_KEY) {
    const groq = new GroqProvider({
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL ?? DEFAULT_MODELS.groq,
    });
    providers.push(groq);
    limits[groq.name] = {
      requestsPerMinute: num(env.GROQ_RPM, 30),
      tokensPerMinute: num(env.GROQ_TPM, 8_000),
    };
  }
  if (providers.length === 0) {
    throw new Error(
      'No LLM provider configured: set GEMINI_API_KEY and/or GROQ_API_KEY (see .env.example)',
    );
  }
  return new LlmClient({
    providers,
    requestsPerMinute: 15,
    tokensPerMinute: 100_000,
    limits,
    ...(onEvent ? { onEvent } : {}),
  });
}
