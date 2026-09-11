// Groq via its OpenAI-compatible chat completions endpoint (no SDK).
import { httpFailure, postJson } from './http.js';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  LlmError,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
} from './types.js';

export interface GroqOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  baseUrl?: string;
}

export class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(opts: GroqOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.baseUrl = opts.baseUrl ?? 'https://api.groq.com/openai/v1';
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const { status, text, headers } = await postJson(
      this.name,
      `${this.baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      },
      this.timeoutMs,
    );
    if (status !== 200) throw httpFailure(this.name, status, text, headers);

    const data = JSON.parse(text) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = data.choices?.[0];
    const out = choice?.message?.content ?? '';
    if (!out.trim()) throw new LlmError('empty', 'groq returned no text', this.name);
    if (choice?.finish_reason === 'length') {
      throw new LlmError('bad_request', 'groq output truncated (length)', this.name);
    }
    return {
      text: out,
      provider: this.name,
      model: this.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
