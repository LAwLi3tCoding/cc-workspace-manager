import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
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

describe('ConfigWriter concurrent writes', () => {
  let tmpDir: string
  let writer: ConfigWriter
  let realFs: typeof fs

  beforeEach(async () => {
    realFs = await vi.importActual<typeof fs>('fs')
    tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'))
    writer = new ConfigWriter()
    // restore real fs for this describe block
    vi.mocked(fs.existsSync).mockImplementation(realFs.existsSync)
    vi.mocked(fs.readFileSync).mockImplementation(realFs.readFileSync as typeof fs.readFileSync)
    vi.mocked(fs.writeFileSync).mockImplementation(realFs.writeFileSync as typeof fs.writeFileSync)
    vi.mocked(fs.renameSync).mockImplementation(realFs.renameSync)
    vi.mocked(fs.copyFileSync).mockImplementation(realFs.copyFileSync)
    vi.mocked(fs.mkdirSync).mockImplementation(realFs.mkdirSync as typeof fs.mkdirSync)
  })

  afterEach(() => {
    realFs.rmSync(tmpDir, { recursive: true })
  })

  it('should not lose data under concurrent writes via patchJsonAsync', async () => {
    const filePath = path.join(tmpDir, 'settings.json')
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        writer.patchJsonAsync(filePath, { [`key${i}`]: `val${i}` })
      )
    )
    const result = JSON.parse(realFs.readFileSync(filePath, 'utf-8'))
    for (let i = 0; i < 10; i++) {
      expect(result[`key${i}`]).toBe(`val${i}`)
    }
  })
})
