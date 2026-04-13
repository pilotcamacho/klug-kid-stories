'use client';

import Link from 'next/link';

interface SessionSummaryProps {
  totalAnswered: number;
  correctCount: number;
  newWordsIntroduced: number;
}

export default function SessionSummary({
  totalAnswered,
  correctCount,
  newWordsIntroduced,
}: SessionSummaryProps) {
  const pct = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Session complete!</h2>
      <p className="text-sm text-gray-500 mb-8">Great work. Here&apos;s how you did:</p>

      <div className="flex justify-center gap-12 mb-8">
        <div>
          <p className="text-3xl font-bold text-indigo-600">{pct}%</p>
          <p className="text-xs text-gray-500 mt-1">
            {correctCount} / {totalAnswered} correct
          </p>
        </div>
        {newWordsIntroduced > 0 && (
          <div>
            <p className="text-3xl font-bold text-indigo-600">{newWordsIntroduced}</p>
            <p className="text-xs text-gray-500 mt-1">
              new word{newWordsIntroduced !== 1 ? 's' : ''} introduced
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Start another session
        </button>
        <Link
          href="/dashboard"
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
