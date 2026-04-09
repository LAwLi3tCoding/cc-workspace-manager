import type { Workspace } from '../../../server/types'

interface Props {
  workspaces: Workspace[]
  selected: string | null
  onSelect: (id: string) => void
  loading: boolean
}

export function WorkspaceSidebar({ workspaces, selected, onSelect, loading }: Props) {
  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          工作空间
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <p className="text-xs text-gray-400 px-3 py-2">加载中...</p>
        )}
        {workspaces.map(ws => (
          <button
            key={ws.id}
            onClick={() => onSelect(ws.id)}
            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
              selected === ws.id
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            } ${!ws.exists ? 'opacity-50' : ''}`}
          >
            <div className="truncate">{ws.name}</div>
            {ws.isGlobal && (
              <div className="text-xs text-gray-400">全局配置</div>
            )}
            {!ws.exists && (
              <div className="text-xs text-red-400">目录已删除</div>
            )}
          </button>
        ))}
      </div>
    </aside>
  )
}
