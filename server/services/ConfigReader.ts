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
    if (scope === 'global') {
      // 全局：优先读 ~/.claude/.mcp.json，fallback ~/.claude/mcp.json
      // 同时合并 settings.json 中的 mcpServers（部分用户写在这里）
      const dotMcp = this.readJson<McpJson>(path.join(this.homeDir, '.claude', '.mcp.json'))
      const mcp = this.readJson<McpJson>(path.join(this.homeDir, '.claude', 'mcp.json'))
      const settings = this.readJson<SettingsJson & { mcpServers?: McpJson['mcpServers'] }>(
        path.join(this.homeDir, '.claude', 'settings.json')
      )
      return {
        ...(mcp?.mcpServers ?? {}),
        ...(dotMcp?.mcpServers ?? {}),
        ...(settings?.mcpServers ?? {}),
      }
    } else {
      // 项目级：支持 <project>/.mcp.json 和 <project>/.claude/.mcp.json 两种位置
      const mcp1 = this.readJson<McpJson>(path.join(basePath, '.mcp.json'))
      const mcp2 = this.readJson<McpJson>(path.join(basePath, '.claude', '.mcp.json'))
      return {
        ...(mcp1?.mcpServers ?? {}),
        ...(mcp2?.mcpServers ?? {}),
      }
    }
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

    // 黑名单优先级最高，即使 enableAllProjectMcpServers=true 也可以被黑名单覆盖
    const disabled = global.disabledMcpjsonServers ?? []
    if (disabled.includes(serverName)) {
      return { enabled: false, overrideByEnableAll: false }
    }

    if (global.enableAllProjectMcpServers) {
      return { enabled: true, overrideByEnableAll: true }
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
