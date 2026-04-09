export type TabId = 'skills' | 'mcps' | 'plugins' | 'hooks'

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
  counts?: { skills?: number; mcps?: number; plugins?: number; hooks?: number }
}

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'skills', label: 'Skills', icon: '⚡' },
  { id: 'mcps', label: 'MCP Servers', icon: '🔌' },
  { id: 'plugins', label: 'Plugins', icon: '🧩' },
  { id: 'hooks', label: 'Hooks', icon: '🪝' },
]

export function TabBar({ active, onChange, counts }: Props) {
  return (
    <div className="flex gap-1 px-6 pt-3 border-b border-slate-200 bg-white">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-all ${
            active === tab.id
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <span className="text-base leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
          {counts?.[tab.id] !== undefined && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              active === tab.id
                ? 'bg-blue-100 text-blue-600'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {counts[tab.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
