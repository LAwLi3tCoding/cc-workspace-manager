import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { PluginManager } from '../services/PluginManager'

const router = Router()
const HOME = process.env.HOME!

router.get('/:workspaceId/plugins', (req, res) => {
  try {
    const { workspaceId } = req.params
    const mgr = new PluginManager(HOME)

    if (workspaceId === 'global') {
      return res.json(mgr.list())
    }

    const scanner = new WorkspaceScanner(HOME)
    const workspaces = scanner.scan()
    const ws = workspaces.find(w => w.id === workspaceId)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    res.json(mgr.list(ws.path))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.patch('/:workspaceId/plugins/:pluginKey', (req, res) => {
  try {
    const { workspaceId, pluginKey } = req.params
    const { enabled } = req.body as { enabled: boolean }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '`enabled` must be boolean' })
    }

    const mgr = new PluginManager(HOME)
    if (workspaceId === 'global') {
      mgr.setEnabled(decodeURIComponent(pluginKey), enabled)
    } else {
      const scanner = new WorkspaceScanner(HOME)
      const workspaces = scanner.scan()
      const ws = workspaces.find(w => w.id === workspaceId)
      if (!ws) return res.status(404).json({ error: 'Workspace not found' })
      mgr.setEnabled(decodeURIComponent(pluginKey), enabled, ws.path)
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/plugins/:pluginKey', (req, res) => {
  try {
    const { pluginKey } = req.params
    const mgr = new PluginManager(HOME)
    mgr.delete(decodeURIComponent(pluginKey))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
