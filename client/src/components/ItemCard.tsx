import type { EffectiveState } from '../../../server/types'
import { ScopeLabel } from './ScopeLabel'

interface BadgeItem {
  label: string
  color: 'yellow' | 'blue' | 'red' | 'green'
}

interface Props {
  name: string
  description?: string
  effective?: EffectiveState
  badge?: string
  badgeColor?: 'yellow' | 'blue' | 'red' | 'green'
  badges?: BadgeItem[]
  onToggle?: (enabled: boolean) => void
  onDelete?: () => void
  deleteDisabledReason?: string
  disabled?: boolean
  disabledReason?: string
  extra?: React.ReactNode
}

const badgeColors = {
  yellow: 'bg-amber-50 text-amber-600 border border-amber-200',
  blue: 'bg-blue-50 text-blue-600 border border-blue-200',
  red: 'bg-red-50 text-red-500 border border-red-200',
  green: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
}

export function ItemCard({
  name, description, effective, badge, badgeColor = 'yellow', badges,
  onToggle, onDelete, deleteDisabledReason, disabled, disabledReason, extra,
}: Props) {
  const allBadges: BadgeItem[] = badges ?? (badge ? [{ label: badge, color: badgeColor }] : [])
  return (
    <div className="item-card flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-xl">
      {/* Status indicator strip */}
      {effective && (
        <div className={`w-0.5 self-stretch rounded-full flex-shrink-0 ${
          effective.enabled ? 'bg-emerald-400' : 'bg-red-300'
        }`} />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold text-slate-800 truncate">{name}</span>
          {allBadges.map(b => (
            <span key={b.label} className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${badgeColors[b.color]}`}>
              {b.label}
            </span>
          ))}
        </div>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">{description}</p>
        )}
        {effective && (
          <div className="mt-1.5">
            <ScopeLabel effective={effective} />
          </div>
        )}
        {disabledReason && (
          <p className="text-[11px] text-amber-500 mt-1 flex items-center gap-1">
            <span>⚠</span> {disabledReason}
          </p>
        )}
        {extra && <div className="mt-2">{extra}</div>}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {onToggle && effective && (
          <div
            className={`toggle-track ${effective.enabled ? 'on' : 'off'}`}
            onClick={() => !disabled && onToggle(!effective.enabled)}
            role="switch"
            aria-checked={effective.enabled}
          >
            <div className="toggle-thumb" />
          </div>
        )}
        {onDelete ? (
          <button
            onClick={onDelete}
            className="p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors rounded-lg"
            title="删除"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        ) : deleteDisabledReason ? (
          <div
            className="p-1.5 text-slate-200 cursor-not-allowed rounded-lg"
            title={deleteDisabledReason}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  )
}
