import { Router } from 'express'
import * as fs from 'fs'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { SkillScanner } from '../services/SkillScanner'

const router = Router()
const HOME = process.env.HOME!

router.get('/:workspaceId/skills', (req, res) => {
  try {
    const { workspaceId } = req.params
    const skillScanner = new SkillScanner(HOME)

    if (workspaceId === 'global') {
      return res.json(skillScanner.scanGlobal())
    }

    const scanner = new WorkspaceScanner(HOME)
    const workspaces = scanner.scan()
    const ws = workspaces.find(w => w.id === workspaceId)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    const globalSkills = skillScanner.scanGlobal()
    const projectSkills = skillScanner.scanProject(ws.path)
    res.json([...globalSkills, ...projectSkills])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/skills/:skillName', (req, res) => {
  try {
    const { workspaceId, skillName } = req.params
    const { scope } = req.query as { scope?: string }
    const skillScanner = new SkillScanner(HOME)

    let skillPath: string
    if (scope === 'global' || workspaceId === 'global') {
      const skills = skillScanner.scanGlobal()
      const skill = skills.find(s => s.name === skillName)
      if (!skill) return res.status(404).json({ error: 'Skill not found' })
      skillPath = skill.path
    } else {
      const scanner = new WorkspaceScanner(HOME)
      const workspaces = scanner.scan()
      const ws = workspaces.find(w => w.id === workspaceId)
      if (!ws) return res.status(404).json({ error: 'Workspace not found' })
      const skills = skillScanner.scanProject(ws.path)
      const skill = skills.find(s => s.name === skillName)
      if (!skill) return res.status(404).json({ error: 'Skill not found' })
      skillPath = skill.path
    }

    const lstat = fs.lstatSync(skillPath)
    if (lstat.isSymbolicLink()) {
      fs.unlinkSync(skillPath)
    } else {
      fs.rmSync(skillPath, { recursive: true })
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
