import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import { McpManager } from '../McpManager'

vi.mock('fs')

describe('McpManager', () => {
  const HOME = '/Users/testuser'

  beforeEach(() => vi.resetAllMocks())

  it('marks server as enabled when in enabledMcpjsonServers', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (String(p).endsWith('.mcp.json')) return JSON.stringify({
        mcpServers: { 'context7': { command: 'uvx', args: ['context7'] } }
      })
      if (String(p).endsWith('settings.json')) return JSON.stringify({
        enabledMcpjsonServers: ['context7'],
        enableAllProjectMcpServers: false,
      })
      throw new Error('ENOENT')
    })
    const mgr = new McpManager(HOME)
    const servers = mgr.list('global', HOME)
    expect(servers[0].effective.enabled).toBe(true)
    expect(servers[0].overrideByEnableAll).toBe(false)
  })

  it('marks all servers enabled when enableAllProjectMcpServers=true', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (String(p).endsWith('.mcp.json')) return JSON.stringify({
        mcpServers: { 'server1': { command: 'uvx', args: [] } }
      })
      if (String(p).endsWith('settings.json')) return JSON.stringify({
        enableAllProjectMcpServers: true,
      })
      throw new Error('ENOENT')
    })
    const mgr = new McpManager(HOME)
    const servers = mgr.list('global', HOME)
    expect(servers[0].effective.enabled).toBe(true)
    expect(servers[0].overrideByEnableAll).toBe(true)
  })
})
