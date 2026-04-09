import type { EffectiveState } from '../../../server/types'

interface Props {
  effective: EffectiveState
}

const sourceLabel: Record<string, string> = {
  global: '全局',
  project: '项目级',
  local: '本地',
  blocklist: '黑名单',
}

export function ScopeLabel({ effective }: Props) {
  const label = sourceLabel[effective.source] ?? effective.source

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`px-1.5 py-0.5 rounded font-medium ${
        effective.enabled
          ? 'bg-green-100 text-green-700'
          : 'bg-red-100 text-red-700'
      }`}>
        {effective.enabled ? '启用' : '禁用'}
      </span>
      <span className="text-gray-400">via {label}</span>
      {effective.overrides && (
        <span className="text-gray-400 text-xs">
          （覆盖{sourceLabel[effective.overrides.source]}
          {effective.overrides.value ? '启用' : '禁用'}）
        </span>
      )}
    </span>
  )
}
