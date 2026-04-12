export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        <SettingRow label="Target language" value="Not set" />
        <SettingRow label="Source language" value="Not set" />
        <SettingRow label="Daily review goal" value="20 words" />
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className="text-sm text-gray-500">{value}</span>
    </div>
  );
}
