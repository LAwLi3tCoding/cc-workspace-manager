import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import { ConfigWriter } from '../ConfigWriter'

vi.mock('fs')

describe('ConfigWriter', () => {
  beforeEach(() => vi.resetAllMocks())

  it('merges patch into existing JSON without overwriting other keys', () => {
    const existing = {
      model: 'claude-opus-4-6',
      enabledPlugins: { 'pluginA@market': true },
      env: { ANTHROPIC_AUTH_TOKEN: 'secret' },
    }
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing))
    vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    vi.mocked(fs.renameSync).mockImplementation(() => {})
    vi.mocked(fs.copyFileSync).mockImplementation(() => {})

    const writer = new ConfigWriter()
    writer.patchJson('/fake/settings.json', {
      enabledPlugins: { 'pluginA@market': false, 'pluginB@market': true },
    })

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
    const written = JSON.parse(writeCall[1] as string)
    expect(written.model).toBe('claude-opus-4-6')
    expect(written.env.ANTHROPIC_AUTH_TOKEN).toBe('secret')
    expect(written.enabledPlugins['pluginA@market']).toBe(false)
    expect(written.enabledPlugins['pluginB@market']).toBe(true)
  })

  it('creates new file if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    vi.mocked(fs.renameSync).mockImplementation(() => {})
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as any)

    const writer = new ConfigWriter()
    writer.patchJson('/fake/new-settings.json', { enabledPlugins: {} })

    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  it('renames tmp to target after writing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
    vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    vi.mocked(fs.renameSync).mockImplementation(() => {})
    vi.mocked(fs.copyFileSync).mockImplementation(() => {})

    const writer = new ConfigWriter()
    writer.patchJson('/fake/settings.json', {})

    expect(fs.renameSync).toHaveBeenCalledWith(
      '/fake/settings.json.tmp',
      '/fake/settings.json'
    )
  })
})
