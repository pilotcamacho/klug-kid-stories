'use client';

export default function StoryGenerating() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8">
      <div className="animate-pulse space-y-3 mb-6">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-11/12" />
        <div className="h-4 bg-gray-200 rounded w-4/5" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
      </div>
      <p className="text-sm text-gray-400 text-center">Generating your story…</p>
    </div>
  );
}
