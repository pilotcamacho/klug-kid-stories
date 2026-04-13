'use client';

interface SessionHeaderProps {
  /** 1-based index of the current card. */
  current: number;
  total: number;
  reviewCount: number;
  newCount: number;
}

export default function SessionHeader({
  current,
  total,
  reviewCount,
  newCount,
}: SessionHeaderProps) {
  const progress = total > 0 ? ((current - 1) / total) * 100 : 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">
          Card {current} of {total}
        </span>
        <div className="flex gap-2">
          {reviewCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {reviewCount} review{reviewCount !== 1 ? 's' : ''}
            </span>
          )}
          {newCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
              {newCount} new
            </span>
          )}
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
