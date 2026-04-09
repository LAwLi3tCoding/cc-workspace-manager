import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'

const router = Router()
const scanner = new WorkspaceScanner()

router.get('/', (_req, res) => {
  try {
    const workspaces = scanner.scan()
    res.json(workspaces)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
