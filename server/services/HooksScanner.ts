import * as fs from 'fs'
import * as path from 'path'
import { ConfigWriter } from './ConfigWriter'

export interface Hook {
  filename: string
  scope: 'global' | 'project'
  path: string
  content: string
  sizeBytes: number
}

export class HooksScanner {
  constructor(private homeDir: string = process.env.HOME!) {}

  scanGlobal(): Hook[] {
    return this.scanDir(path.join(this.homeDir, '.claude', 'hooks'), 'global')
  }

  scanProject(projectPath: string): Hook[] {
    return this.scanDir(path.join(projectPath, '.claude', 'hooks'), 'project')
  }

  private scanDir(hooksDir: string, scope: 'global' | 'project'): Hook[] {
    if (!fs.existsSync(hooksDir)) return []
    const hooks: Hook[] = []
    for (const entry of fs.readdirSync(hooksDir)) {
      const fullPath = path.join(hooksDir, entry)
      try {
        const stat = fs.statSync(fullPath)
        if (!stat.isFile()) continue
        const content = fs.readFileSync(fullPath, 'utf-8')
        hooks.push({
          filename: entry,
          scope,
          path: fullPath,
          content,
          sizeBytes: stat.size,
        })
      } catch { /* skip */ }
    }
    return hooks
  }

  delete(hookPath: string): void {
    fs.unlinkSync(hookPath)
  }

  createInSettings(
    settingsPath: string,
    event: string,
    matcher: string,
    command: string
  ): void {
    const writer = new ConfigWriter()
    let existing: Record<string, unknown> = {}
    if (fs.existsSync(settingsPath)) {
      try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) } catch { existing = {} }
    }
    const hooks = (existing.hooks as Record<string, unknown[]> | undefined) ?? {}
    const eventHooks: unknown[] = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : []
    eventHooks.push({
      matcher: matcher === '*' ? {} : { tool_name: matcher },
      hooks: [{ type: 'command', command }],
    })
    writer.patchJson(settingsPath, { hooks: { ...hooks, [event]: eventHooks } })
  }
}
