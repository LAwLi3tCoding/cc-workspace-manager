import * as fs from 'fs'
import * as path from 'path'
import { EffectiveState } from '../types'

interface SettingsJson {
  enabledPlugins?: Record<string, boolean>
  enabledMcpjsonServers?: string[]
  disabledMcpjsonServers?: string[]
  enableAllProjectMcpServers?: boolean
  [key: string]: unknown
}

interface McpJson {
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>
}

export class ConfigReader {
  constructor(private homeDir: string = process.env.HOME!) {}

  readGlobalSettings(): SettingsJson {
    return this.readJson<SettingsJson>(
      path.join(this.homeDir, '.claude', 'settings.json')
    ) ?? {}
  }

  readProjectSettings(projectPath: string): SettingsJson {
    return this.readJson<SettingsJson>(
      path.join(projectPath, '.claude', 'settings.json')
    ) ?? {}
  }

  readLocalSettings(projectPath: string): SettingsJson {
    return this.readJson<SettingsJson>(
      path.join(projectPath, '.claude', 'settings.local.json')
    ) ?? {}
  }

  readMcpServers(scope: 'global' | 'project', basePath: string): McpJson['mcpServers'] {
    const filePath = scope === 'global'
      ? path.join(this.homeDir, '.claude', '.mcp.json')
      : path.join(basePath, '.mcp.json')
    const data = this.readJson<McpJson>(filePath)
    return data?.mcpServers ?? {}
  }

  getEffectivePluginState(pluginKey: string, projectPath?: string): EffectiveState {
    const global = this.readGlobalSettings()
    const globalVal = global.enabledPlugins?.[pluginKey]

    if (!projectPath || projectPath === path.join(this.homeDir, '.claude')) {
      return { enabled: globalVal ?? true, source: 'global' }
    }

    const project = this.readProjectSettings(projectPath)
    const projectVal = project.enabledPlugins?.[pluginKey]

    if (projectVal !== undefined) {
      return {
        enabled: projectVal,
        source: 'project',
        overrides: globalVal !== undefined
          ? { source: 'global', value: globalVal }
          : undefined,
      }
    }

    return { enabled: globalVal ?? true, source: 'global' }
  }

  getEffectiveMcpState(serverName: string): {
    enabled: boolean
    overrideByEnableAll: boolean
  } {
    const global = this.readGlobalSettings()

    if (global.enableAllProjectMcpServers) {
      return { enabled: true, overrideByEnableAll: true }
    }

    const disabled = global.disabledMcpjsonServers ?? []
    if (disabled.includes(serverName)) {
      return { enabled: false, overrideByEnableAll: false }
    }

    const enabled = global.enabledMcpjsonServers ?? []
    return { enabled: enabled.includes(serverName), overrideByEnableAll: false }
  }

  private readJson<T>(filePath: string): T | null {
    try {
      if (!fs.existsSync(filePath)) return null
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }
}
