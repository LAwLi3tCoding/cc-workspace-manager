import { useState, useEffect, useCallback, useRef } from 'react'
import type { Workspace, Skill, McpServer, Plugin, HookFile } from '../../server/types'
import { api } from './api'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { TabBar, type TabId } from './components/TabBar'
import { ItemCard } from './components/ItemCard'

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center fade-in">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <p className="text-sm font-medium text-slate-400">{title}</p>
      <p className="text-xs text-slate-300 mt-1">{desc}</p>
    </div>
  )
}

// ── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonList() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl">
          <div className="skeleton w-0.5 h-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-48 rounded" />
            <div className="skeleton h-2.5 w-32 rounded" />
          </div>
          <div className="skeleton w-9 h-5 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ── Add MCP Modal ─────────────────────────────────────────────────────────────
function AddMcpModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState<'stdio' | 'sse'>('stdio')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [envStr, setEnvStr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const parseEnv = (s: string): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const line of s.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    return result
  }

  const submit = async () => {
    if (!name.trim()) { setError('名称不能为空'); return }
    if (type === 'stdio' && !command.trim()) { setError('命令不能为空'); return }
    if (type === 'sse' && !url.trim()) { setError('URL 不能为空'); return }
    setSaving(true)
    try {
      await api.createMcp(workspaceId, {
        name: name.trim(),
        type,
        command: type === 'stdio' ? command.trim() : undefined,
        args: type === 'stdio' && args.trim() ? args.trim().split(/\s+/) : undefined,
        url: type === 'sse' ? url.trim() : undefined,
        env: envStr.trim() ? parseEnv(envStr) : undefined,
      })
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-800 mb-4">添加 MCP 服务器</h2>
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">名称</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="my-mcp-server" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">类型</label>
            <div className="flex gap-3">
              {(['stdio', 'sse'] as const).map(t => (
                <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={type === t} onChange={() => { setType(t); setError(null) }} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          {type === 'stdio' ? (
            <>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">命令</label>
                <input value={command} onChange={e => setCommand(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
                  placeholder="uvx mcp-server-name" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">参数（空格分隔，可选）</label>
                <input value={args} onChange={e => setArgs(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
                  placeholder="--port 8080" />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">URL</label>
              <input value={url} onChange={e => setUrl(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
                placeholder="http://localhost:3000/sse" />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">环境变量（每行 KEY=VALUE，可选）</label>
            <textarea value={envStr} onChange={e => setEnvStr(e.target.value)} rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-400"
              placeholder={'API_KEY=xxx\nDEBUG=1'} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">取消</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
            {saving ? '保存中...' : '添加'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Hook Modal ────────────────────────────────────────────────────────────
const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'Stop', 'Notification', 'SubagentStop']

function AddHookModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [event, setEvent] = useState(HOOK_EVENTS[0])
  const [matcher, setMatcher] = useState('*')
  const [command, setCommand] = useState('')
  const [scope, setScope] = useState<'global' | 'project'>(
    workspaceId === 'global' ? 'global' : 'project'
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!command.trim()) { setError('命令不能为空'); return }
    setSaving(true)
    try {
      await api.createHook(workspaceId, { event, matcher: matcher || '*', command: command.trim(), scope })
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-800 mb-4">添加 Hook</h2>
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">事件类型</label>
            <select value={event} onChange={e => setEvent(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
              {HOOK_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">匹配器（工具名或 * 匹配全部）</label>
            <input value={matcher} onChange={e => setMatcher(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
              placeholder="* 或 Bash" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">命令</label>
            <input value={command} onChange={e => setCommand(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
              placeholder="echo hello" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Scope</label>
            <div className="flex gap-3">
              {(['global', 'project'] as const).map(s => (
                <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={scope === s} onChange={() => setScope(s)}
                    disabled={workspaceId === 'global' && s === 'project'} />
                  {s}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">取消</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
            {saving ? '保存中...' : '添加'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hook preview card ────────────────────────────────────────────────────────
function HookCard({ hook, onDelete }: { hook: HookFile; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const sizeLabel = hook.sizeBytes < 1024
    ? `${hook.sizeBytes}B`
    : `${(hook.sizeBytes / 1024).toFixed(1)}KB`

  return (
    <div className="item-card bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-0.5 self-stretch rounded-full bg-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-slate-800">{hook.filename}</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              {hook.scope}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{sizeLabel}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">{hook.path}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="px-2 py-1 text-[11px] text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors font-mono"
          >
            {expanded ? '▲ hide' : '▼ preview'}
          </button>
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
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 fade-in">
          <div className="code-preview max-h-48 overflow-y-auto">
            {hook.content || '(empty)'}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('skills')
  const activeTabRef = useRef<TabId>('skills')
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  const [skills, setSkills] = useState<Skill[]>([])
  const [mcps, setMcps] = useState<McpServer[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [hooks, setHooks] = useState<HookFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updateBanner, setUpdateBanner] = useState<{
    latestVersion: string; releaseUrl: string
  } | null>(null)
  const [showAddMcp, setShowAddMcp] = useState(false)
  const [showAddHook, setShowAddHook] = useState(false)

  const extractError = (e: unknown): string => {
    if (e instanceof Error) return e.message
    return String(e)
  }

  useEffect(() => {
    api.getWorkspaces().then(ws => {
      setWorkspaces(ws)
      if (ws.length > 0) setSelectedId(ws[0].id)
    }).catch(e => setError(extractError(e)))

    api.checkUpdate().then(info => {
      if (info.hasUpdate && info.latestVersion && info.releaseUrl) {
        setUpdateBanner({ latestVersion: info.latestVersion, releaseUrl: info.releaseUrl })
      }
    }).catch(() => { /* ignore */ })
  }, [])

  const loadAllData = useCallback(async (wsId: string) => {
    setLoading(true)
    setError(null)
    try {
      const [s, m, p, h] = await Promise.all([
        api.getSkills(wsId),
        api.getMcps(wsId),
        api.getPlugins(wsId),
        api.getHooks(wsId),
      ])
      setSkills(s)
      setMcps(m)
      setPlugins(p)
      setHooks(h)
    } catch (e) {
      setError(extractError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTabData = useCallback(async (wsId: string, tab: TabId) => {
    setLoading(true)
    setError(null)
    try {
      if (tab === 'skills') setSkills(await api.getSkills(wsId))
      else if (tab === 'mcps') setMcps(await api.getMcps(wsId))
      else if (tab === 'plugins') setPlugins(await api.getPlugins(wsId))
      else if (tab === 'hooks') setHooks(await api.getHooks(wsId))
    } catch (e) {
      setError(extractError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadAllData(selectedId)
  }, [selectedId, loadAllData])

  // SSE 实时同步：文件变化时自动刷新当前 Tab
  useEffect(() => {
    if (!selectedId) return
    const es = new EventSource('/api/events')
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; workspaceId: string }
        if (msg.type === 'workspace-changed' && msg.workspaceId === selectedId) {
          loadTabData(selectedId, activeTabRef.current)
        }
      } catch { /* ignore malformed */ }
    }
    es.onerror = () => {
      // EventSource 会自动重连，此处仅记录
      console.warn('[SSE] connection error, browser will retry automatically')
    }
    return () => es.close()
  }, [selectedId, loadTabData])

  const refresh = () => {
    if (selectedId) loadTabData(selectedId, activeTab)
  }

  const confirmDelete = (name: string, action: () => Promise<unknown>) => {
    if (!confirm(`确认删除 "${name}"？此操作不可撤销。`)) return
    action()
      .then(() => selectedId && loadTabData(selectedId, activeTab))
      .catch(e => setError(extractError(e)))
  }

  const selectedWs = workspaces.find(w => w.id === selectedId)

  return (
    <div className="flex h-screen overflow-hidden">
      <WorkspaceSidebar
        workspaces={workspaces}
        selected={selectedId}
        onSelect={id => { setSelectedId(id); setActiveTab('skills') }}
        loading={workspaces.length === 0}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Update banner */}
        {updateBanner && (
          <div className="flex items-center justify-between px-6 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-700">
            <span>
              🎉 新版本可用：<strong>v{updateBanner.latestVersion}</strong>，运行以下命令更新：
              <code className="mx-2 px-1.5 py-0.5 bg-blue-100 rounded font-mono">
                curl -fsSL https://raw.githubusercontent.com/LAwLi3tCoding/cc-workspace-manager/master/install.sh | bash
              </code>
            </span>
            <div className="flex items-center gap-3 flex-shrink-0">
              <a href={updateBanner.releaseUrl} target="_blank" rel="noreferrer"
                className="underline hover:text-blue-900">查看更新内容</a>
              <button onClick={() => setUpdateBanner(null)}
                className="text-blue-400 hover:text-blue-700">✕</button>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200">
          <div>
            <h1 className="text-sm font-semibold text-slate-800 tracking-tight">
              CC Workspace Manager
            </h1>
            {selectedWs && (
              <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate max-w-lg">
                {selectedWs.path}
              </p>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-all disabled:opacity-40"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </header>

        {/* TabBar */}
        <TabBar
          active={activeTab}
          onChange={setActiveTab}
          counts={{
            skills: skills.length,
            mcps: mcps.length,
            plugins: plugins.length,
            hooks: hooks.length,
          }}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto main-scroll p-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs fade-in">
              <span className="text-base leading-none">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <SkeletonList />
          ) : (
            <div className="space-y-2 fade-in">
              {activeTab === 'mcps' && (
                <div className="flex justify-end mb-3">
                  <button onClick={() => setShowAddMcp(true)}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1">
                    + 添加 MCP
                  </button>
                </div>
              )}
              {activeTab === 'hooks' && (
                <div className="flex justify-end mb-3">
                  <button onClick={() => setShowAddHook(true)}
                    className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-1">
                    + 添加 Hook
                  </button>
                </div>
              )}
              {/* Skills */}
              {activeTab === 'skills' && (
                skills.length === 0
                  ? <EmptyState icon="⚡" title="No skills found" desc="No skills installed in this workspace" />
                  : skills.map(skill => {
                    // 项目工作空间内不允许删除全局 skill
                    const canDelete = selectedId === 'global' || skill.scope === 'project'
                    return (
                      <ItemCard
                        key={skill.path}
                        name={skill.name}
                        description={skill.description || skill.path}
                        badges={[
                          skill.scope === 'global'
                            ? { label: 'global', color: 'blue' as const }
                            : { label: 'project', color: 'green' as const },
                          ...(skill.isSymlink ? [{ label: 'symlink', color: 'yellow' as const }] : []),
                        ]}
                        symlinkTarget={skill.symlinkTarget}
                        symlinkBroken={skill.symlinkBroken}
                        onDelete={canDelete ? () => confirmDelete(skill.name, () =>
                          api.deleteSkill(selectedId!, skill.name, skill.scope)
                        ) : undefined}
                        deleteDisabledReason={!canDelete ? '全局 skill 不可在项目工作空间中删除' : undefined}
                      />
                    )
                  })
              )}

              {/* MCPs */}
              {activeTab === 'mcps' && (
                mcps.length === 0
                  ? <EmptyState icon="🔌" title="No MCP servers" desc="No MCP servers configured" />
                  : mcps.map(mcp => (
                    <ItemCard
                      key={mcp.name}
                      name={mcp.name}
                      description={`${mcp.command} ${mcp.args.join(' ')}`}
                      effective={mcp.effective}
                      disabledReason={mcp.overrideByEnableAll ? 'enableAllProjectMcpServers=true · disable writes to blacklist' : undefined}
                      onToggle={enabled =>
                        api.setMcpEnabled(selectedId!, mcp.name, enabled)
                          .then(() => loadTabData(selectedId!, 'mcps'))
                          .catch(e => setError(extractError(e)))
                      }
                      onDelete={() => confirmDelete(mcp.name, () =>
                        api.deleteMcp(selectedId!, mcp.name)
                      )}
                    />
                  ))
              )}

              {/* Plugins */}
              {activeTab === 'plugins' && (
                plugins.length === 0
                  ? <EmptyState icon="🧩" title="No plugins" desc="No plugins installed" />
                  : plugins.map(plugin => (
                    <ItemCard
                      key={plugin.key}
                      name={plugin.name}
                      description={`${plugin.key} · v${plugin.version} · ${plugin.scope}`}
                      effective={plugin.effective}
                      badge={plugin.blocklisted ? 'blocklisted' : undefined}
                      badgeColor="red"
                      onToggle={enabled =>
                        api.setPluginEnabled(selectedId!, plugin.key, enabled)
                          .then(() => loadTabData(selectedId!, 'plugins'))
                          .catch(e => setError(extractError(e)))
                      }
                      onDelete={() => confirmDelete(plugin.key, () =>
                        api.deletePlugin(selectedId!, plugin.key)
                      )}
                    />
                  ))
              )}

              {/* Hooks */}
              {activeTab === 'hooks' && (
                hooks.length === 0
                  ? <EmptyState icon="🪝" title="No hooks" desc="No hook scripts in this workspace" />
                  : hooks.map(hook => (
                    <HookCard
                      key={hook.path}
                      hook={hook}
                      onDelete={() => confirmDelete(hook.filename, () =>
                        api.deleteHook(selectedId!, hook.filename, hook.scope)
                      )}
                    />
                  ))
              )}
            </div>
          )}
        </div>
      </main>
      {showAddMcp && selectedId && (
        <AddMcpModal
          workspaceId={selectedId}
          onClose={() => setShowAddMcp(false)}
          onCreated={() => selectedId && loadTabData(selectedId, 'mcps')}
        />
      )}
      {showAddHook && selectedId && (
        <AddHookModal
          workspaceId={selectedId}
          onClose={() => setShowAddHook(false)}
          onCreated={() => selectedId && loadTabData(selectedId, 'hooks')}
        />
      )}
    </div>
  )
}
