// Builds the provider chain from environment variables documented in .env.example (D11, D17).
import { LlmClient, type LlmEvent } from './client.js';
import { GeminiProvider } from './gemini.js';
import { GroqProvider } from './groq.js';
import type { LlmProvider } from './types.js';

export type EnvLike = Record<string, string | undefined>;

export function llmClientFromEnv(env: EnvLike, onEvent?: (e: LlmEvent) => void): LlmClient {
  const providers: LlmProvider[] = [];
  if (env.GEMINI_API_KEY) {
    providers.push(
      new GeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      }),
    );
  }
  if (env.GROQ_API_KEY) {
    providers.push(
      new GroqProvider({
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      }),
    );
  }
  if (providers.length === 0) {
    throw new Error(
      'No LLM provider configured: set GEMINI_API_KEY and/or GROQ_API_KEY (see .env.example)',
    );
  }
  return new LlmClient({
    providers,
    requestsPerMinute: Number(env.LLM_RPM ?? 8),
    tokensPerMinute: Number(env.LLM_TPM ?? 200_000),
    ...(onEvent ? { onEvent } : {}),
  });
}
