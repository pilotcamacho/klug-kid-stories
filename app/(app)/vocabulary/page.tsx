export default function VocabularyPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vocabulary</h1>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors">
          + Add word
        </button>
      </div>
      <p className="text-gray-500 text-sm">Your vocabulary list will appear here. (Phase 2)</p>
    </div>
  );
}
