import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { McpManager } from '../services/McpManager'

const router = Router()
const HOME = process.env.HOME!

function resolveWorkspace(workspaceId: string) {
  if (workspaceId === 'global') return { scope: 'global' as const, basePath: HOME }
  const ws = new WorkspaceScanner(HOME).scan().find(w => w.id === workspaceId)
  if (!ws) return null
  return { scope: 'project' as const, basePath: ws.path }
}

router.get('/:workspaceId/mcps', (req, res) => {
  try {
    const resolved = resolveWorkspace(req.params.workspaceId)
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })
    const mgr = new McpManager(HOME)
    res.json(mgr.list(resolved.scope, resolved.basePath))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post('/:workspaceId/mcps', (req, res) => {
  try {
    const resolved = resolveWorkspace(req.params.workspaceId)
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })
    const { name, type, command, args, url, env } = req.body as {
      name: string; type: 'stdio' | 'sse'; command?: string; args?: string[];
      url?: string; env?: Record<string, string>
    }
    if (!name) return res.status(400).json({ error: '`name` is required' })
    if (type !== 'stdio' && type !== 'sse') return res.status(400).json({ error: '`type` must be stdio or sse' })
    if (type === 'stdio' && !command) return res.status(400).json({ error: '`command` required for stdio' })
    if (type === 'sse' && !url) return res.status(400).json({ error: '`url` required for sse' })

    const mgr = new McpManager(HOME)
    const config = type === 'stdio'
      ? { type: 'stdio' as const, command: command!, args, env }
      : { type: 'sse' as const, url: url!, env }
    mgr.create(name, config, resolved.scope, resolved.basePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.patch('/:workspaceId/mcps/:serverName', (req, res) => {
  try {
    const resolved = resolveWorkspace(req.params.workspaceId)
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })
    const { serverName } = req.params
    const { enabled } = req.body as { enabled: boolean }
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: '`enabled` must be boolean' })
    const mgr = new McpManager(HOME)
    mgr.setEnabled(serverName, enabled, resolved.scope, resolved.basePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/mcps/:serverName', (req, res) => {
  try {
    const resolved = resolveWorkspace(req.params.workspaceId)
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })
    const { serverName } = req.params
    const mgr = new McpManager(HOME)
    mgr.delete(serverName, resolved.scope, resolved.basePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
