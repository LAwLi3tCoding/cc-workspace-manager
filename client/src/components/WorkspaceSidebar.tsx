import { useState } from 'react'
import type { Workspace } from '../../../server/types'

interface Props {
  workspaces: Workspace[]
  selected: string | null
  onSelect: (id: string) => void
  loading: boolean
}

function WorkspaceIcon({ isGlobal, name }: { isGlobal: boolean; name: string }) {
  if (isGlobal) {
    return (
      <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
        <span className="text-blue-400 text-xs">⬡</span>
      </div>
    )
  }
  const initial = name.charAt(0).toUpperCase()
  const colors = ['bg-violet-500/20 text-violet-400', 'bg-emerald-500/20 text-emerald-400',
    'bg-orange-500/20 text-orange-400', 'bg-pink-500/20 text-pink-400',
    'bg-cyan-500/20 text-cyan-400', 'bg-yellow-500/20 text-yellow-400']
  const color = colors[initial.charCodeAt(0) % colors.length]
  return (
    <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
      <span className="text-xs font-bold font-mono">{initial}</span>
    </div>
  )
}

export function WorkspaceSidebar({ workspaces, selected, onSelect, loading }: Props) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? workspaces.filter(ws =>
        ws.name.toLowerCase().includes(query.toLowerCase()) ||
        ws.path.toLowerCase().includes(query.toLowerCase())
      )
    : workspaces

  return (
    <aside className="w-60 shrink-0 flex flex-col" style={{ background: 'var(--sidebar-bg)' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">CC</span>
          </div>
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--sidebar-text)' }}>
            Workspaces
          </span>
        </div>
        {/* Search box */}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索工作空间..."
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white/10 border border-white/10 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-400/50"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading && (
          <div className="px-4 py-2 space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton h-8 w-full opacity-20" />
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-3 text-xs text-slate-500">未找到匹配的工作空间</p>
        )}
        {filtered.map(ws => (
          <button
            key={ws.id}
            onClick={() => onSelect(ws.id)}
            className={`ws-item w-full text-left px-3 py-2 flex items-center gap-2.5 ${
              selected === ws.id ? 'active' : ''
            }`}
          >
            <WorkspaceIcon isGlobal={ws.isGlobal} name={ws.name} />
            <div className="min-w-0">
              <div className={`text-xs font-medium truncate ${
                selected === ws.id ? 'text-slate-100' : 'text-slate-400'
              }`}>
                {ws.name}
              </div>
              {ws.isGlobal && (
                <div className="text-[10px] font-mono" style={{ color: 'var(--sidebar-text)' }}>
                  global
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <p className="text-[10px] font-mono" style={{ color: 'var(--sidebar-text)' }}>
          {filtered.length}/{workspaces.length} workspaces
        </p>
      </div>
    </aside>
  )
}
