import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { McpManager } from '../McpManager'

describe('McpManager scope routing', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'))
    // 创建全局 .mcp.json
    fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, '.claude', '.mcp.json'),
      JSON.stringify({ mcpServers: { globalServer: { command: 'g', args: [] } } })
    )
    // 创建项目 .mcp.json
    const projDir = path.join(tmpDir, 'myproject')
    fs.mkdirSync(projDir, { recursive: true })
    fs.writeFileSync(
      path.join(projDir, '.mcp.json'),
      JSON.stringify({ mcpServers: { projServer: { command: 'p', args: [] } } })
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('list with project scope returns project servers', () => {
    const mgr = new McpManager(tmpDir)
    const projDir = path.join(tmpDir, 'myproject')
    const servers = mgr.list('project', projDir)
    expect(servers.map(s => s.name)).toContain('projServer')
    expect(servers.map(s => s.name)).not.toContain('globalServer')
  })

  it('create adds server to correct scope file', async () => {
    const mgr = new McpManager(tmpDir)
    const projDir = path.join(tmpDir, 'myproject')
    await mgr.create('newServer', { type: 'stdio', command: 'echo', args: ['hello'] }, 'project', projDir)
    const content = JSON.parse(fs.readFileSync(path.join(projDir, '.mcp.json'), 'utf-8'))
    expect(content.mcpServers.newServer).toBeDefined()
    expect(content.mcpServers.newServer.command).toBe('echo')
  })
})
