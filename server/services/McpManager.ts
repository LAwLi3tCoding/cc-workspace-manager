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
        command: def.command,
        args: def.args,
        env: def.env,
        definedIn: scope,
        effective: { enabled, source: 'global' },
        overrideByEnableAll,
      })
    }

    return results
  }

  setEnabled(serverName: string, enabled: boolean): void {
    const settingsPath = path.join(this.homeDir, '.claude', 'settings.json')
    if (enabled) {
      this.writer.patchArrayField(settingsPath, 'enabledMcpjsonServers', serverName, 'add')
      this.writer.patchArrayField(settingsPath, 'disabledMcpjsonServers', serverName, 'remove')
    } else {
      this.writer.patchArrayField(settingsPath, 'enabledMcpjsonServers', serverName, 'remove')
      this.writer.patchArrayField(settingsPath, 'disabledMcpjsonServers', serverName, 'add')
    }
  }

  delete(serverName: string): void {
    const mcpPath = path.join(this.homeDir, '.claude', '.mcp.json')
    const existing = this.reader.readMcpServers('global', this.homeDir)
    const { [serverName]: _removed, ...rest } = existing
    this.writer.patchJson(mcpPath, { mcpServers: rest })
  }
}
