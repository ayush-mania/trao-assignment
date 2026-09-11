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
  readonly name: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(opts: GeminiOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.name = `gemini:${opts.model}`;
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
          ...generationExtras(this.model, req.json),
        },
      },
      this.timeoutMs,
    );
    if (status !== 200) throw geminiFailure(this.name, status, text, headers);

    const data = JSON.parse(text) as {
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
        finishReason?: string;
      }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const candidate = data.candidates?.[0];
    // Gemma returns its reasoning as parts flagged thought:true ahead of the answer; drop them.
    const out =
      candidate?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('') ?? '';
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

/**
 * Per-model generation settings, verified against the live API on 2026-09-11:
 *  - gemini-2.x: thinkingBudget; gemini-3.x: thinkingLevel (3.x rejects thinkingBudget with 400)
 *  - gemma: no thinking config ("not supported") and no JSON mime type; answers are still JSON
 *    because the system prompt demands it and thought parts are filtered out.
 * Thinking is kept minimal everywhere: our calls are structured extraction, not reasoning puzzles,
 * and thinking tokens count against maxOutputTokens.
 */
export function generationExtras(model: string, json: boolean): Record<string, unknown> {
  if (/^gemma/.test(model)) return {};
  const thinkingConfig = /^gemini-2\./.test(model)
    ? { thinkingBudget: 0 }
    : { thinkingLevel: 'LOW' };
  return { thinkingConfig, ...(json ? { responseMimeType: 'application/json' } : {}) };
}
