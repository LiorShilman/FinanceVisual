import { useState } from 'react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

function formatDigits(n: number): string {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? '0' : '';
  return Math.round(n).toLocaleString('en-US');
}

function parseDigits(text: string): number {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

/** Text input that displays whole numbers grouped with commas (1,000,000) while editing. */
export function NumberField({ value, onChange, className, placeholder, disabled }: Props) {
  const [text, setText] = useState(() => formatDigits(value));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    setText(formatDigits(value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const parsed = parseDigits(e.target.value);
        setText(formatDigits(parsed));
        onChange(parsed);
      }}
    />
  );
}
