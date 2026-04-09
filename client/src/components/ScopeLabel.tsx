import type { EffectiveState } from '../../../server/types'

interface Props {
  effective: EffectiveState
}

const sourceLabel: Record<string, string> = {
  global: 'global',
  project: 'project',
  local: 'local',
  blocklist: 'blocklist',
}

export function ScopeLabel({ effective }: Props) {
  const label = sourceLabel[effective.source] ?? effective.source

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-xs ${
        effective.enabled
          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          : 'bg-red-50 text-red-500 border border-red-200'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${effective.enabled ? 'bg-emerald-500' : 'bg-red-400'}`} />
        {effective.enabled ? 'enabled' : 'disabled'}
      </span>
      <span className="text-slate-400 font-mono text-[10px]">via {label}</span>
      {effective.overrides && (
        <span className="text-slate-400 text-[10px]">
          · overrides {sourceLabel[effective.overrides.source]} {effective.overrides.value ? 'on' : 'off'}
        </span>
      )}
    </span>
  )
}
