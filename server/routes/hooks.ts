import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { HooksScanner } from '../services/HooksScanner'

const router = Router()
const HOME = process.env.HOME!

router.get('/:workspaceId/hooks', (req, res) => {
  try {
    const { workspaceId } = req.params
    const scanner = new HooksScanner(HOME)
    if (workspaceId === 'global') {
      return res.json(scanner.scanGlobal())
    }
    const ws = new WorkspaceScanner(HOME).scan().find(w => w.id === workspaceId)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    res.json([...scanner.scanGlobal(), ...scanner.scanProject(ws.path)])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/hooks/:filename', (req, res) => {
  try {
    const { workspaceId, filename } = req.params
    const { scope } = req.query as { scope?: string }

    // 防止 path traversal：filename 不能包含路径分隔符
    if (filename.includes('/') || filename.includes('..') || filename.includes('\0')) {
      return res.status(400).json({ error: 'Invalid filename' })
    }

    const scanner = new HooksScanner(HOME)
    let hooks
    if (scope === 'global' || workspaceId === 'global') {
      hooks = scanner.scanGlobal()
    } else {
      const ws = new WorkspaceScanner(HOME).scan().find(w => w.id === workspaceId)
      if (!ws) return res.status(404).json({ error: 'Workspace not found' })
      hooks = scanner.scanProject(ws.path)
    }
    const hook = hooks.find(h => h.filename === filename)
    if (!hook) return res.status(404).json({ error: 'Hook not found' })
    scanner.delete(hook.path)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
