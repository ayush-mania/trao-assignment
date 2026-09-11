'use client';
import { useState } from 'react';
import { useDebouncedSave } from '@/lib/use-builder';
import { cn } from '@/lib/utils';

/**
 * Inline-editable text that looks like text until focused (ChatGPT-style), saves on a debounce
 * and on blur, and reflects server-side changes when not focused.
 */
export function EditableText({
  value,
  onSave,
  label,
  rows = 2,
  className,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  rows?: number;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (!focused && value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const save = useDebouncedSave((v) => {
    if (v.trim() && v !== value) onSave(v);
  });
  return (
    <textarea
      aria-label={label}
      value={draft}
      rows={rows}
      placeholder={placeholder}
      className={cn(
        'field-sizing-content w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 leading-relaxed outline-none transition-colors',
        'hover:border-border hover:bg-accent/30 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30',
        className,
      )}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (draft.trim() && draft !== value) onSave(draft);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        save(e.target.value);
      }}
    />
  );
}
