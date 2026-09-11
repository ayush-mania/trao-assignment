// A scripted LlmClient for tests: returns the given JSON strings in order, no network.
import { LlmClient } from '../llm/client.js';
import type { CompletionRequest, CompletionResult, LlmProvider } from '../llm/types.js';

export function fakeLlm(answers: unknown[]): LlmClient & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  const queue = [...answers];
  const provider: LlmProvider = {
    name: 'fake',
    model: 'fake',
    async complete(req): Promise<CompletionResult> {
      calls.push(req);
      const next = queue.shift();
      if (next === undefined) throw new Error('fakeLlm: no scripted answer left');
      return {
        text: typeof next === 'string' ? next : JSON.stringify(next),
        provider: 'fake',
        model: 'fake',
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },
  };
  const client = new LlmClient({
    providers: [provider],
    requestsPerMinute: 1000,
    tokensPerMinute: 10_000_000,
    sleep: async () => {},
  }) as LlmClient & { calls: CompletionRequest[] };
  client.calls = calls;
  return client;
}
