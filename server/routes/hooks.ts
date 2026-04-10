import * as path from 'path'
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

router.post('/:workspaceId/hooks', (req, res) => {
  try {
    const { workspaceId } = req.params
    const { event, matcher, command, scope } = req.body as {
      event: string; matcher: string; command: string; scope: 'global' | 'project'
    }
    if (!event || !command) return res.status(400).json({ error: '`event` and `command` are required' })

    const VALID_HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'Stop', 'Notification', 'SubagentStop']
    if (!VALID_HOOK_EVENTS.includes(event)) {
      return res.status(400).json({ error: `Invalid event. Must be one of: ${VALID_HOOK_EVENTS.join(', ')}` })
    }

    const scanner = new HooksScanner(HOME)
    let settingsPath: string
    if (scope === 'global' || workspaceId === 'global') {
      settingsPath = path.join(HOME, '.claude', 'settings.json')
    } else {
      const ws = new WorkspaceScanner(HOME).scan().find(w => w.id === workspaceId)
      if (!ws) return res.status(404).json({ error: 'Workspace not found' })
      settingsPath = path.join(ws.path, '.claude', 'settings.json')
    }
    scanner.createInSettings(settingsPath, event, matcher ?? '*', command)
    res.json({ ok: true })
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
