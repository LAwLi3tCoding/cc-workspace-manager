export type TabId = 'skills' | 'mcps' | 'plugins'

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
  counts?: { skills?: number; mcps?: number; plugins?: number }
}

const tabs: { id: TabId; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'mcps', label: 'MCP Servers' },
  { id: 'plugins', label: 'Plugins' },
]

export function TabBar({ active, onChange, counts }: Props) {
  return (
    <div className="flex border-b border-gray-200">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            active === tab.id
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
          {counts?.[tab.id] !== undefined && (
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {counts[tab.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
