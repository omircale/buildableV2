import { useEffect, useState } from 'react';

/**
 * A whole number a person types.
 *
 * The field holds what was typed until the person is done with it, and only then hands the number on.
 * It never clamps: whether a number is too large is for whoever receives it to say out loud, because a
 * field that quietly turns 120 into 20 has changed the survey without telling anyone. If the number is
 * refused, the field goes back to the value that is actually recorded.
 */
export function CountInput({ value, onCommit, label, min }: { value: number; onCommit: (n: number) => void; label: string; min: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isInteger(n) && n >= min && n !== value) onCommit(n);
    // Whatever happened, show what is recorded — which is the new number only if it was accepted.
    setText(String(value));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(String(value));
      }}
      className="h-8 w-14 rounded-md bg-transparent px-1 text-center text-body tabular-nums outline-none focus:bg-sunken"
    />
  );
}
