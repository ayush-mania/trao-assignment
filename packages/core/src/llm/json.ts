// Model output → JSON. Handles code fences, prose around the object, and common syntax slips.
import { jsonrepair } from 'jsonrepair';

export function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence?.[1]) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start > 0) s = s.slice(start);
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (end >= 0 && end < s.length - 1) s = s.slice(0, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    return JSON.parse(jsonrepair(s));
  }
}
