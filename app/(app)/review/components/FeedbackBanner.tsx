'use client';

import type { SubmitAnswerOutput } from '@/lib/progressActions';

interface FeedbackBannerProps {
  result: SubmitAnswerOutput;
  expectedAnswer: string;
}

export default function FeedbackBanner({ result, expectedAnswer }: FeedbackBannerProps) {
  const { responseScore, wasCorrect, nextReviewAt } = result;
  const daysUntil = Math.max(1, Math.round(
    (nextReviewAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));
  const reviewLabel = daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

  if (wasCorrect) {
    return (
      <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm">
        <p className="font-medium text-green-800">Correct!</p>
        <p className="text-green-700 mt-0.5">Next review {reviewLabel}.</p>
      </div>
    );
  }

  if (responseScore >= 0.3) {
    return (
      <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm">
        <p className="font-medium text-yellow-800">Almost!</p>
        <p className="text-yellow-700 mt-0.5">
          The answer was <span className="font-semibold">{expectedAnswer}</span>. Review scheduled sooner.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm">
      <p className="font-medium text-red-800">Incorrect.</p>
      <p className="text-red-700 mt-0.5">
        The answer was <span className="font-semibold">{expectedAnswer}</span>. Review {reviewLabel}.
      </p>
    </div>
  );
}
