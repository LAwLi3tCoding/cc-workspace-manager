import { useState, useEffect, useCallback } from 'react'
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
  const [skills, setSkills] = useState<Skill[]>([])
  const [mcps, setMcps] = useState<McpServer[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [hooks, setHooks] = useState<HookFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updateBanner, setUpdateBanner] = useState<{
    latestVersion: string; releaseUrl: string
  } | null>(null)

  useEffect(() => {
    api.getWorkspaces().then(ws => {
      setWorkspaces(ws)
      if (ws.length > 0) setSelectedId(ws[0].id)
    }).catch(e => setError(String(e)))

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
      setError(String(e))
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
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadAllData(selectedId)
  }, [selectedId, loadAllData])

  const refresh = () => {
    if (selectedId) loadAllData(selectedId)
  }

  const confirmDelete = (name: string, action: () => Promise<unknown>) => {
    if (!confirm(`确认删除 "${name}"？此操作不可撤销。`)) return
    action()
      .then(() => selectedId && loadTabData(selectedId, activeTab))
      .catch(e => setError(String(e)))
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
                          .catch(e => setError(String(e)))
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
                          .catch(e => setError(String(e)))
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
    </div>
  )
}
