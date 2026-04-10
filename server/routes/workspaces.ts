import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { McpManager } from '../services/McpManager'

const router = Router()
const scanner = new WorkspaceScanner()
const HOME = process.env.HOME!

router.get('/', (_req, res) => {
  try {
    const workspaces = scanner.scan().filter(w => w.exists)
    res.json(workspaces)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// 导出工作空间配置（MCPs）
router.get('/:workspaceId/export', (req, res) => {
  try {
    const { workspaceId } = req.params
    const workspaces = scanner.scan()
    const ws = workspaceId === 'global'
      ? { scope: 'global' as const, basePath: HOME, name: 'global' }
      : (() => {
          const found = workspaces.find(w => w.id === workspaceId)
          if (!found) return null
          return { scope: 'project' as const, basePath: found.path, name: found.name }
        })()
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    const mgr = new McpManager(HOME)
    const mcps = mgr.list(ws.scope, ws.basePath)

    const exportData = {
      workspace: ws.name,
      exportedAt: new Date().toISOString(),
      mcps: mcps.map(({ name, type, command, args, url, env }: { name: string; type: string; command?: string; args?: string[]; url?: string; env?: Record<string, string> }) => ({ name, type, command, args, url, env })),
    }

    res.setHeader('Content-Disposition', `attachment; filename="${ws.name}-config.json"`)
    res.setHeader('Content-Type', 'application/json')
    res.json(exportData)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// 导入工作空间配置
router.post('/:workspaceId/import', (req, res) => {
  try {
    const { workspaceId } = req.params
    const workspaces = scanner.scan()
    const resolved = workspaceId === 'global'
      ? { scope: 'global' as const, basePath: HOME }
      : (() => {
          const found = workspaces.find(w => w.id === workspaceId)
          if (!found) return null
          return { scope: 'project' as const, basePath: found.path }
        })()
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })

    const mgr = new McpManager(HOME)

    const { mcps } = req.body as {
      mcps?: Array<{ name: string; type: 'stdio' | 'sse'; command?: string; args?: string[]; url?: string; env?: Record<string, string> }>
    }

    let imported = 0
    for (const mcp of mcps ?? []) {
      if (!mcp.name || !mcp.type) continue
      const FORBIDDEN_NAMES = ['__proto__', 'constructor', 'prototype']
      if (FORBIDDEN_NAMES.includes(mcp.name) || mcp.name.trim() === '') continue
      const config = mcp.type === 'sse'
        ? { type: 'sse' as const, url: mcp.url!, env: mcp.env }
        : { type: 'stdio' as const, command: mcp.command!, args: mcp.args, env: mcp.env }
      try {
        mgr.create(mcp.name, config, resolved.scope, resolved.basePath)
        imported++
      } catch { /* skip invalid entries */ }
    }

    res.json({ ok: true, imported })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
