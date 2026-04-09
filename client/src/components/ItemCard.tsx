import type { EffectiveState } from '../../../server/types'
import { ScopeLabel } from './ScopeLabel'

interface Props {
  name: string
  description?: string
  effective?: EffectiveState
  badge?: string
  onToggle?: (enabled: boolean) => void
  onDelete?: () => void
  disabled?: boolean
  disabledReason?: string
}

export function ItemCard({
  name, description, effective, badge,
  onToggle, onDelete, disabled, disabledReason,
}: Props) {
  return (
    <div className="flex items-start justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-medium text-gray-900 truncate">{name}</span>
          {badge && (
            <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{description}</p>
        )}
        {effective && (
          <div className="mt-1">
            <ScopeLabel effective={effective} />
          </div>
        )}
        {disabled && disabledReason && (
          <p className="text-xs text-amber-600 mt-0.5">{disabledReason}</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        {onToggle && effective && (
          <button
            onClick={() => onToggle(!effective.enabled)}
            disabled={disabled}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              effective.enabled ? 'bg-green-500' : 'bg-gray-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              effective.enabled ? 'translate-x-4' : 'translate-x-1'
            }`} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded"
            title="删除"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
