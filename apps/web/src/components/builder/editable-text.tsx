'use client';
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedSave } from '@/lib/use-builder';

/** A textarea that saves on a debounce and reflects server-side changes when not focused. */
export function EditableText({
  value,
  onSave,
  label,
  rows = 2,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  rows?: number;
  className?: string;
}) {
  // Local draft while focused; the server value otherwise. Tracked with a "last seen value" so a
  // server-side change (e.g. a regeneration) is reflected without a setState-in-effect cascade.
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
    <Textarea
      aria-label={label}
      value={draft}
      rows={rows}
      className={className}
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
