'use client';

import { useEffect, useRef } from 'react';
import type { SessionItem } from '@/lib/session';
import type { SubmitAnswerOutput } from '@/lib/progressActions';
import { languageName } from '@/app/lib/languages';
import AnswerInput from './AnswerInput';
import FeedbackBanner from './FeedbackBanner';

interface ReviewCardProps {
  item: SessionItem;
  input: string;
  submitted: boolean;
  result: SubmitAnswerOutput | null;
  submitting: boolean;
  submitError: string | null;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onNext: () => void;
}

/** Replaces occurrences of the lemma in the example sentence with ___. */
function blankLemma(sentence: string, lemma: string): string {
  const escaped = lemma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(new RegExp(escaped, 'gi'), '___');
}

export default function ReviewCard({
  item,
  input,
  submitted,
  result,
  submitting,
  submitError,
  onInputChange,
  onSubmit,
  onNext,
}: ReviewCardProps) {
  const isNew = item.wordType === 'new';

  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; });

  useEffect(() => {
    if (!submitted) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNextRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [submitted]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8">
      {/* Badge */}
      <div className="mb-4">
        {isNew ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
            New word
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Review
          </span>
        )}
      </div>

      {/* Question */}
      <p className="text-lg text-gray-700 mb-1">
        What is the{' '}
        <span className="font-semibold text-gray-900">{languageName(item.targetLanguage)}</span>{' '}
        word for:
      </p>
      <p className="text-2xl font-bold text-gray-900 mb-4">&ldquo;{item.meaning}&rdquo;</p>

      {/* Example sentence */}
      {item.exampleSentence && (
        <p className="text-sm text-gray-400 italic mb-6">
          {blankLemma(item.exampleSentence, item.lemma)}
        </p>
      )}

      {/* Input — after submission, always show the correct answer in the field */}
      <div className="mb-4">
        {submitted && result ? (
          <div className="border rounded-md px-4 py-3 text-base bg-gray-50 flex items-center gap-3">
            {!result.wasCorrect && input.trim() && (
              <span className="text-red-500 line-through">{input.trim()}</span>
            )}
            <span className="text-green-700 font-semibold">{item.lemma}</span>
          </div>
        ) : (
          <AnswerInput
            value={input}
            onChange={onInputChange}
            onEnter={onSubmit}
            disabled={submitting}
            autoFocus={true}
          />
        )}
      </div>

      {/* Feedback */}
      {result && (
        <div className="mb-4">
          <FeedbackBanner result={result} expectedAnswer={item.lemma} />
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <p className="text-sm text-red-500 mb-4">{submitError}</p>
      )}

      {/* Action button */}
      {!submitted ? (
        <button
          onClick={onSubmit}
          disabled={submitting || input.trim().length === 0}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Checking…' : 'Submit'}
        </button>
      ) : (
        <button
          onClick={onNext}
          className="w-full bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Next (or press Enter)
        </button>
      )}
    </div>
  );
}
