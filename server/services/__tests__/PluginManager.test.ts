import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import { PluginManager } from '../PluginManager'

vi.mock('fs')

describe('PluginManager', () => {
  const HOME = '/Users/testuser'
  const PROJECT = '/Users/testuser/my-project'

  beforeEach(() => vi.resetAllMocks())

  it('lists plugins with effective state from project override', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps.endsWith('installed_plugins.json')) return JSON.stringify({
        'pluginA@market': [{ scope: 'user', installPath: '/path/a', version: '1.0' }]
      })
      if (ps.endsWith('blocklist.json')) return JSON.stringify({})
      if (ps.includes(PROJECT) && ps.endsWith('settings.json')) return JSON.stringify({
        enabledPlugins: { 'pluginA@market': false }
      })
      if (ps.endsWith('settings.json')) return JSON.stringify({
        enabledPlugins: { 'pluginA@market': true }
      })
      throw new Error('ENOENT')
    })
    const mgr = new PluginManager(HOME)
    const plugins = mgr.list(PROJECT)
    expect(plugins[0].effective.enabled).toBe(false)
    expect(plugins[0].effective.source).toBe('project')
  })
})
