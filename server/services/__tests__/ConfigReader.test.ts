import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import { ConfigReader } from '../ConfigReader'

vi.mock('fs')

const mockReadFileSync = (files: Record<string, object>) => {
  vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
    const content = files[p as string]
    if (!content) throw new Error(`ENOENT: ${p}`)
    return JSON.stringify(content)
  })
  vi.mocked(fs.existsSync).mockImplementation((p: any) => p in files)
}

describe('ConfigReader', () => {
  const HOME = '/Users/testuser'
  const PROJECT = '/Users/testuser/my-project'

  beforeEach(() => vi.resetAllMocks())

  it('reads global settings.json', () => {
    mockReadFileSync({
      [`${HOME}/.claude/settings.json`]: {
        enabledPlugins: { 'pluginA@market': true },
        enableAllProjectMcpServers: false,
      },
    })
    const reader = new ConfigReader(HOME)
    const settings = reader.readGlobalSettings()
    expect(settings.enabledPlugins?.['pluginA@market']).toBe(true)
  })

  it('computes effective plugin state: project overrides global', () => {
    mockReadFileSync({
      [`${HOME}/.claude/settings.json`]: {
        enabledPlugins: { 'pluginA@market': true },
      },
      [`${PROJECT}/.claude/settings.json`]: {
        enabledPlugins: { 'pluginA@market': false },
      },
    })
    const reader = new ConfigReader(HOME)
    const effective = reader.getEffectivePluginState('pluginA@market', PROJECT)
    expect(effective.enabled).toBe(false)
    expect(effective.source).toBe('project')
    expect(effective.overrides).toMatchObject({ source: 'global', value: true })
  })

  it('falls back to global when project has no override', () => {
    mockReadFileSync({
      [`${HOME}/.claude/settings.json`]: {
        enabledPlugins: { 'pluginA@market': true },
      },
      [`${PROJECT}/.claude/settings.json`]: {
        enabledPlugins: {},
      },
    })
    const reader = new ConfigReader(HOME)
    const effective = reader.getEffectivePluginState('pluginA@market', PROJECT)
    expect(effective.enabled).toBe(true)
    expect(effective.source).toBe('global')
    expect(effective.overrides).toBeUndefined()
  })

  it('reads .mcp.json servers', () => {
    mockReadFileSync({
      [`${HOME}/.claude/.mcp.json`]: {
        mcpServers: {
          'context7': { command: 'uvx', args: ['context7'] },
        },
      },
    })
    const reader = new ConfigReader(HOME)
    const servers = reader.readMcpServers('global', HOME)
    expect(servers['context7']).toMatchObject({ command: 'uvx' })
  })
})
