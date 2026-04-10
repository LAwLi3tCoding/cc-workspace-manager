import * as path from 'path'
import { McpServer } from '../types'
import { ConfigReader } from './ConfigReader'
import { ConfigWriter } from './ConfigWriter'

export class McpManager {
  private reader: ConfigReader
  private writer: ConfigWriter

  constructor(private homeDir: string = process.env.HOME!) {
    this.reader = new ConfigReader(homeDir)
    this.writer = new ConfigWriter()
  }

  list(scope: 'global' | 'project', basePath: string): McpServer[] {
    const servers = this.reader.readMcpServers(scope, basePath)
    const results: McpServer[] = []

    for (const [name, def] of Object.entries(servers)) {
      const { enabled, overrideByEnableAll } = this.reader.getEffectiveMcpState(name)
      results.push({
        name,
        type: def.url ? 'sse' : 'stdio',
        command: def.command,
        args: def.args,
        url: def.url,
        env: def.env,
        definedIn: scope,
        effective: { enabled, source: 'global' },
        overrideByEnableAll,
      })
    }

    return results
  }

  async setEnabled(serverName: string, enabled: boolean, scope: 'global' | 'project' = 'global', basePath?: string): Promise<void> {
    const settingsPath = scope === 'project' && basePath
      ? path.join(basePath, '.claude', 'settings.json')
      : path.join(this.homeDir, '.claude', 'settings.json')

    if (enabled) {
      await this.writer.patchArrayField(settingsPath, 'enabledMcpjsonServers', serverName, 'add')
      await this.writer.patchArrayField(settingsPath, 'disabledMcpjsonServers', serverName, 'remove')
    } else {
      await this.writer.patchArrayField(settingsPath, 'enabledMcpjsonServers', serverName, 'remove')
      await this.writer.patchArrayField(settingsPath, 'disabledMcpjsonServers', serverName, 'add')
    }
  }

  async delete(serverName: string, scope: 'global' | 'project' = 'global', basePath?: string): Promise<void> {
    const mcpPath = scope === 'project' && basePath
      ? path.join(basePath, '.mcp.json')
      : path.join(this.homeDir, '.claude', '.mcp.json')

    const existing = this.reader.readMcpServers(scope, basePath ?? this.homeDir)
    if (!(serverName in existing)) {
      throw new Error(`MCP server '${serverName}' not found`)
    }
    const { [serverName]: _removed, ...rest } = existing
    await this.writer.replaceFieldAsync(mcpPath, 'mcpServers', rest)
  }

  async create(
    serverName: string,
    config: { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
           | { type: 'sse'; url: string; env?: Record<string, string> },
    scope: 'global' | 'project' = 'global',
    basePath?: string
  ): Promise<void> {
    const mcpPath = scope === 'project' && basePath
      ? path.join(basePath, '.mcp.json')
      : path.join(this.homeDir, '.claude', '.mcp.json')

    const entry = config.type === 'stdio'
      ? { command: config.command, args: config.args ?? [], env: config.env }
      : { url: config.url, env: config.env }

    const existing = this.reader.readMcpServers(scope, basePath ?? this.homeDir)
    await this.writer.replaceFieldAsync(mcpPath, 'mcpServers', { ...existing, [serverName]: entry })
  }
}
