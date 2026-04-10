import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { McpManager } from '../services/McpManager'

const router = Router()
const HOME = process.env.HOME!

function resolveWs(id: string, workspaces: ReturnType<WorkspaceScanner['scan']>) {
  if (id === 'global') return { scope: 'global' as const, basePath: HOME }
  const ws = workspaces.find(w => w.id === id)
  if (!ws) return null
  return { scope: 'project' as const, basePath: ws.path }
}

router.post('/', (req, res) => {
  try {
    const { type, itemName, sourceWorkspaceId, targetWorkspaceId } = req.body as {
      type: 'mcp' | 'plugin'
      itemName: string
      sourceWorkspaceId: string
      targetWorkspaceId: string
    }
    if (!type || !itemName || !sourceWorkspaceId || !targetWorkspaceId) {
      return res.status(400).json({ error: 'type, itemName, sourceWorkspaceId, targetWorkspaceId are required' })
    }
    if (type !== 'mcp') {
      return res.status(400).json({ error: 'Only mcp copy is supported' })
    }

    const scanner = new WorkspaceScanner()
    const workspaces = scanner.scan()

    const src = resolveWs(sourceWorkspaceId, workspaces)
    const tgt = resolveWs(targetWorkspaceId, workspaces)
    if (!src) return res.status(404).json({ error: 'Source workspace not found' })
    if (!tgt) return res.status(404).json({ error: 'Target workspace not found' })

    const mgr = new McpManager(HOME)
    const servers = mgr.list(src.scope, src.basePath)
    const server = servers.find(s => s.name === itemName)
    if (!server) return res.status(404).json({ error: `MCP server '${itemName}' not found` })

    const config = server.type === 'sse'
      ? { type: 'sse' as const, url: server.url!, env: server.env }
      : { type: 'stdio' as const, command: server.command!, args: server.args, env: server.env }
    mgr.create(itemName, config, tgt.scope, tgt.basePath)

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
