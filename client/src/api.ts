import type { Workspace, Skill, McpServer, Plugin, HookFile } from '../../server/types'

const BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  getWorkspaces: () => request<Workspace[]>('/workspaces'),

  getSkills: (workspaceId: string) =>
    request<Skill[]>(`/workspaces/${workspaceId}/skills`),

  deleteSkill: (workspaceId: string, skillName: string, scope: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/skills/${skillName}?scope=${scope}`, {
      method: 'DELETE',
    }),

  getMcps: (workspaceId: string) =>
    request<McpServer[]>(`/workspaces/${workspaceId}/mcps`),

  setMcpEnabled: (workspaceId: string, serverName: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/mcps/${serverName}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  deleteMcp: (workspaceId: string, serverName: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/mcps/${serverName}`, {
      method: 'DELETE',
    }),

  getPlugins: (workspaceId: string) =>
    request<Plugin[]>(`/workspaces/${workspaceId}/plugins`),

  setPluginEnabled: (workspaceId: string, pluginKey: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/plugins/${encodeURIComponent(pluginKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  deletePlugin: (workspaceId: string, pluginKey: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/plugins/${encodeURIComponent(pluginKey)}`, {
      method: 'DELETE',
    }),

  getHooks: (workspaceId: string) =>
    request<HookFile[]>(`/workspaces/${workspaceId}/hooks`),

  deleteHook: (workspaceId: string, filename: string, scope: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/hooks/${encodeURIComponent(filename)}?scope=${scope}`, {
      method: 'DELETE',
    }),

  createMcp: (
    workspaceId: string,
    data: {
      name: string
      type: 'stdio' | 'sse'
      command?: string
      args?: string[]
      url?: string
      env?: Record<string, string>
    }
  ) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/mcps`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createHook: (
    workspaceId: string,
    data: { event: string; matcher: string; command: string; scope: 'global' | 'project' }
  ) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/hooks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  checkUpdate: () => request<{
    hasUpdate: boolean
    currentVersion: string
    latestVersion: string | null
    releaseUrl: string | null
  }>('/update-check'),
}
