import { useState, useEffect, useCallback } from 'react'
import type { Workspace, Skill, McpServer, Plugin } from '../../server/types'
import { api } from './api'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { TabBar, type TabId } from './components/TabBar'
import { ItemCard } from './components/ItemCard'

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('skills')
  const [skills, setSkills] = useState<Skill[]>([])
  const [mcps, setMcps] = useState<McpServer[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getWorkspaces().then(ws => {
      setWorkspaces(ws)
      if (ws.length > 0) setSelectedId(ws[0].id)
    }).catch(e => setError(String(e)))
  }, [])

  const loadTabData = useCallback(async (wsId: string, tab: TabId) => {
    setLoading(true)
    setError(null)
    try {
      if (tab === 'skills') setSkills(await api.getSkills(wsId))
      if (tab === 'mcps') setMcps(await api.getMcps(wsId))
      if (tab === 'plugins') setPlugins(await api.getPlugins(wsId))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadTabData(selectedId, activeTab)
  }, [selectedId, activeTab, loadTabData])

  const confirmDelete = (name: string, action: () => Promise<unknown>) => {
    if (!confirm(`确认删除 "${name}"？此操作不可撤销。`)) return
    action().then(() => selectedId && loadTabData(selectedId, activeTab))
      .catch(e => setError(String(e)))
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-sm">
      <WorkspaceSidebar
        workspaces={workspaces}
        selected={selectedId}
        onSelect={id => { setSelectedId(id); setActiveTab('skills') }}
        loading={workspaces.length === 0}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <header className="px-6 py-3 border-b border-gray-200 bg-white">
          <h1 className="text-base font-semibold text-gray-900">
            CC Workspace Manager
          </h1>
          {selectedId && (
            <p className="text-xs text-gray-500 mt-0.5">
              {workspaces.find(w => w.id === selectedId)?.path}
            </p>
          )}
        </header>

        <div className="px-6 bg-white border-b border-gray-200">
          <TabBar
            active={activeTab}
            onChange={setActiveTab}
            counts={{
              skills: skills.length,
              mcps: mcps.length,
              plugins: plugins.length,
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {error}
            </div>
          )}

          {loading && (
            <div className="text-gray-400 text-xs">加载中...</div>
          )}

          {!loading && activeTab === 'skills' && (
            <div className="space-y-2">
              {skills.length === 0 && <p className="text-gray-400 text-xs">暂无 skill</p>}
              {skills.map(skill => (
                <ItemCard
                  key={skill.path}
                  name={skill.name}
                  description={skill.description}
                  badge={skill.isSymlink ? 'symlink' : skill.scope === 'global' ? '全局' : '项目'}
                  onDelete={() => confirmDelete(skill.name, () =>
                    api.deleteSkill(selectedId!, skill.name, skill.scope)
                  )}
                />
              ))}
            </div>
          )}

          {!loading && activeTab === 'mcps' && (
            <div className="space-y-2">
              {mcps.length === 0 && <p className="text-gray-400 text-xs">暂无 MCP server</p>}
              {mcps.map(mcp => (
                <ItemCard
                  key={mcp.name}
                  name={mcp.name}
                  description={`${mcp.command} ${mcp.args.join(' ')}`}
                  effective={mcp.effective}
                  disabled={mcp.overrideByEnableAll}
                  disabledReason={mcp.overrideByEnableAll ? 'enableAllProjectMcpServers=true，所有 server 强制启用' : undefined}
                  onToggle={enabled =>
                    api.setMcpEnabled(selectedId!, mcp.name, enabled)
                      .then(() => loadTabData(selectedId!, 'mcps'))
                      .catch(e => setError(String(e)))
                  }
                  onDelete={() => confirmDelete(mcp.name, () =>
                    api.deleteMcp(selectedId!, mcp.name)
                  )}
                />
              ))}
            </div>
          )}

          {!loading && activeTab === 'plugins' && (
            <div className="space-y-2">
              {plugins.length === 0 && <p className="text-gray-400 text-xs">暂无 plugin</p>}
              {plugins.map(plugin => (
                <ItemCard
                  key={plugin.key}
                  name={plugin.key}
                  description={`v${plugin.version} · ${plugin.scope}`}
                  effective={plugin.effective}
                  badge={plugin.blocklisted ? '已屏蔽' : undefined}
                  onToggle={enabled =>
                    api.setPluginEnabled(selectedId!, plugin.key, enabled)
                      .then(() => loadTabData(selectedId!, 'plugins'))
                      .catch(e => setError(String(e)))
                  }
                  onDelete={() => confirmDelete(plugin.key, () =>
                    api.deletePlugin(selectedId!, plugin.key)
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
