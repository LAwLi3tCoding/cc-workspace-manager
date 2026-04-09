import * as fs from 'fs'
import * as path from 'path'
import { Plugin } from '../types'
import { ConfigReader } from './ConfigReader'
import { ConfigWriter } from './ConfigWriter'

interface InstalledPlugin {
  scope: 'user' | 'project' | 'local'
  installPath: string
  version: string
  projectPath?: string
  gitCommitSha?: string
}

interface Blocklist {
  [key: string]: { reason?: string; timestamp?: string }
}

export class PluginManager {
  private reader: ConfigReader
  private writer: ConfigWriter

  constructor(private homeDir: string = process.env.HOME!) {
    this.reader = new ConfigReader(homeDir)
    this.writer = new ConfigWriter()
  }

  list(projectPath?: string): Plugin[] {
    const registryPath = path.join(this.homeDir, '.claude', 'plugins', 'installed_plugins.json')
    const blocklistPath = path.join(this.homeDir, '.claude', 'plugins', 'blocklist.json')

    let registry: Record<string, InstalledPlugin[]> = {}
    let blocklist: Blocklist = {}

    try {
      if (fs.existsSync(registryPath)) {
        registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
      }
      if (fs.existsSync(blocklistPath)) {
        blocklist = JSON.parse(fs.readFileSync(blocklistPath, 'utf-8'))
      }
    } catch {
      return []
    }

    const plugins: Plugin[] = []

    for (const [key, entries] of Object.entries(registry)) {
      const entry = entries[0]
      if (!entry) continue

      const atIndex = key.lastIndexOf('@')
      const name = atIndex > 0 ? key.substring(0, atIndex) : key
      const marketplace = atIndex > 0 ? key.substring(atIndex + 1) : 'unknown'
      const effective = this.reader.getEffectivePluginState(key, projectPath)
      const blocklisted = key in blocklist

      plugins.push({
        key,
        name,
        marketplace,
        version: entry.version,
        scope: entry.scope,
        installPath: entry.installPath,
        projectPath: entry.projectPath,
        effective,
        blocklisted,
        blocklistReason: blocklist[key]?.reason,
      })
    }

    return plugins
  }

  setEnabled(pluginKey: string, enabled: boolean, projectPath?: string): void {
    const isGlobal = !projectPath || projectPath === path.join(this.homeDir, '.claude')
    const settingsPath = isGlobal
      ? path.join(this.homeDir, '.claude', 'settings.json')
      : path.join(projectPath, '.claude', 'settings.json')

    this.writer.patchJson(settingsPath, {
      enabledPlugins: { [pluginKey]: enabled },
    })
  }

  delete(pluginKey: string): void {
    const registryPath = path.join(this.homeDir, '.claude', 'plugins', 'installed_plugins.json')
    if (!fs.existsSync(registryPath)) return

    const registry: Record<string, InstalledPlugin[]> = JSON.parse(
      fs.readFileSync(registryPath, 'utf-8')
    )
    const { [pluginKey]: _removed, ...rest } = registry
    this.writer.patchJson(registryPath, rest)
  }
}
