'use client';

import type { Segment } from '@/lib/storySession';
import type { SubmitAnswerOutput } from '@/lib/progressActions';
import AnswerInput from '../../components/AnswerInput';
import FeedbackBanner from '../../components/FeedbackBanner';

interface BlankAnswer {
  value: string;
  result: SubmitAnswerOutput | null;
  submitted: boolean;
  expectedAnswer: string;
  conjugatedForm: string;
}

interface StoryDisplayProps {
  segments: Segment[];
  currentBlankIndex: number;
  answers: BlankAnswer[];
  input: string;
  submitting: boolean;
  submitError: string | null;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  /** Advance to the next blank, next story group, or session summary. */
  onNext: () => void;
}

export default function StoryDisplay({
  segments,
  currentBlankIndex,
  answers,
  input,
  submitting,
  submitError,
  onInputChange,
  onSubmit,
  onNext,
}: StoryDisplayProps) {
  const currentAnswer = answers[currentBlankIndex];
  const allAnswered = answers.length > 0 && answers.every((a) => a.submitted);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8">
      {/* Story text with inline blanks */}
      <p className="text-base leading-8 text-gray-800 mb-6">
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return <span key={i}>{seg.content}</span>;
          }

          const answer = answers[seg.index];
          const isActive = seg.index === currentBlankIndex && !answer?.submitted;
          const isAnswered = answer?.submitted;
          const wasCorrect = answer?.result?.wasCorrect;

          if (isAnswered) {
            // Reveal the student's answer, coloured by correctness
            return (
              <span
                key={i}
                className={`inline-block font-semibold px-1 rounded ${
                  wasCorrect
                    ? 'text-green-700 bg-green-50'
                    : 'text-red-700 bg-red-50'
                }`}
                title={wasCorrect ? 'Correct!' : `Correct: ${answer.expectedAnswer}`}
              >
                {answer.value || answer.expectedAnswer}
              </span>
            );
          }

          if (isActive) {
            // Render the inline input for the active blank, keeping the hint visible
            return (
              <span key={i} className="inline-block align-middle mx-1">
                <AnswerInput
                  value={input}
                  onChange={onInputChange}
                  onEnter={onSubmit}
                  disabled={submitting}
                  autoFocus={true}
                />
                <span className="text-gray-500 text-sm ml-1">({seg.hint})</span>
              </span>
            );
          }

          // Future blank — show hint as gray placeholder
          return (
            <span key={i} className="text-gray-400 font-medium mx-0.5">
              ___ ({seg.hint})
            </span>
          );
        })}
      </p>

      {/* Feedback for the most recently answered blank */}
      {currentAnswer?.submitted && currentAnswer.result && (
        <div className="mb-4">
          <FeedbackBanner
            result={currentAnswer.result}
            expectedAnswer={currentAnswer.expectedAnswer}
            conjugatedForm={currentAnswer.conjugatedForm}
          />
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <p className="text-sm text-red-500 mb-4">{submitError}</p>
      )}

      {/* Action button */}
      {!currentAnswer?.submitted ? (
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
          {allAnswered ? 'Continue →' : 'Next blank →'}
        </button>
      )}
    </div>
  );
}
