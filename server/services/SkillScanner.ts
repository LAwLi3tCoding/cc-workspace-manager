import * as fs from 'fs'
import * as path from 'path'
import { Skill } from '../types'

export class SkillScanner {
  constructor(private homeDir: string = process.env.HOME!) {}

  scanGlobal(): Skill[] {
    const skillsDir = path.join(this.homeDir, '.claude', 'skills')
    return this.scanDir(skillsDir, 'global')
  }

  scanProject(projectPath: string): Skill[] {
    const skillsDir = path.join(projectPath, '.claude', 'skills')
    return this.scanDir(skillsDir, 'project')
  }

  private scanDir(skillsDir: string, scope: 'global' | 'project'): Skill[] {
    if (!fs.existsSync(skillsDir)) return []
    const skills: Skill[] = []

    for (const entry of fs.readdirSync(skillsDir)) {
      const fullPath = path.join(skillsDir, entry)
      try {
        const lstat = fs.lstatSync(fullPath)
        const isSymlink = lstat.isSymbolicLink()
        let symlinkTarget: string | undefined
        let resolvedPath = fullPath

        if (isSymlink) {
          symlinkTarget = fs.readlinkSync(fullPath)
          try {
            resolvedPath = fs.realpathSync(fullPath)
          } catch {
            // broken symlink — still include it
          }
        }

        if (!lstat.isDirectory() && !isSymlink) continue

        const skillMdPath = path.join(resolvedPath, 'SKILL.md')
        let description = ''
        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const match = content.match(/^description:\s*(.+)$/m)
          if (match) description = match[1].trim()
        }

        skills.push({
          name: entry,
          description,
          scope,
          path: fullPath,
          isSymlink,
          symlinkTarget,
        })
      } catch {
        // skip unreadable entries
      }
    }

    return skills
  }
}
