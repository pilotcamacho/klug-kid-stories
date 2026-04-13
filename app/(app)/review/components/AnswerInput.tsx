'use client';

import { useEffect, useRef } from 'react';

interface AnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user presses Enter. */
  onEnter: () => void;
  disabled: boolean;
  autoFocus: boolean;
}

export default function AnswerInput({
  value,
  onChange,
  onEnter,
  disabled,
  autoFocus,
}: AnswerInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    }
  }

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      placeholder="Type your answer…"
      className="w-full border border-gray-300 rounded-md px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
    />
  );
}
