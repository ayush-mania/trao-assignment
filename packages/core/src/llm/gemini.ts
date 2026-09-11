// Gemini via the REST API (no SDK). JSON mode through responseMimeType.
import { httpFailure, postJson } from './http.js';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  LlmError,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
} from './types.js';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  baseUrl?: string;
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(opts: GeminiOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const { status, text, headers } = await postJson(
      this.name,
      url,
      { 'x-goog-api-key': this.apiKey },
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          // Thinking tokens count against maxOutputTokens on 2.5 models; our calls are structured
          // extraction, not reasoning puzzles, so spend the budget on the answer.
          thinkingConfig: { thinkingBudget: 0 },
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
        },
      },
      this.timeoutMs,
    );
    if (status !== 200) throw geminiFailure(this.name, status, text, headers);

    const data = JSON.parse(text) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const candidate = data.candidates?.[0];
    const out = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!out.trim()) throw new LlmError('empty', 'gemini returned no text', this.name);
    // A truncated body would be "repaired" into a silently partial object downstream.
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new LlmError('bad_request', 'gemini output truncated (MAX_TOKENS)', this.name);
    }
    return {
      text: out,
      provider: this.name,
      model: this.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

/** Gemini puts the retry hint in the error body (`retryDelay: "7s"`) rather than a header. */
function geminiFailure(provider: string, status: number, body: string, headers: Headers): LlmError {
  const base = httpFailure(provider, status, body, headers);
  if (base.retryAfterMs !== undefined) return base;
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return m ? new LlmError(base.kind, base.message, provider, Number(m[1]) * 1000) : base;
}
