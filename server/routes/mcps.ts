import { Router } from 'express'
import { McpManager } from '../services/McpManager'

const router = Router()
const HOME = process.env.HOME!

router.get('/:workspaceId/mcps', (_req, res) => {
  try {
    const mgr = new McpManager(HOME)
    const servers = mgr.list('global', HOME)
    res.json(servers)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.patch('/:workspaceId/mcps/:serverName', (req, res) => {
  try {
    const { serverName } = req.params
    const { enabled } = req.body as { enabled: boolean }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '`enabled` must be boolean' })
    }
    const mgr = new McpManager(HOME)
    mgr.setEnabled(serverName, enabled)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/mcps/:serverName', (req, res) => {
  try {
    const { serverName } = req.params
    const mgr = new McpManager(HOME)
    mgr.delete(serverName)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
