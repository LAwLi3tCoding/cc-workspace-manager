import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import { WorkspaceScanner } from '../WorkspaceScanner'

vi.mock('fs')

describe('WorkspaceScanner', () => {
  const HOME = '/Users/testuser'

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns global workspace for ~/.claude/', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([])
    const scanner = new WorkspaceScanner(HOME)
    const workspaces = scanner.scan()
    expect(workspaces[0]).toMatchObject({
      id: 'global',
      path: `${HOME}/.claude`,
      name: 'Global (~/.claude)',
      isGlobal: true,
    })
  })

  it('decodes slug to path and checks existence', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['-Users-testuser-my-project'] as any)
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      p === `${HOME}/my-project`
    )
    const scanner = new WorkspaceScanner(HOME)
    const workspaces = scanner.scan()
    const proj = workspaces.find(w => !w.isGlobal)
    expect(proj).toMatchObject({
      path: `${HOME}/my-project`,
      name: 'my-project',
      exists: true,
    })
  })

  it('marks workspace as not existing when directory is gone', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['-Users-testuser-deleted-proj'] as any)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const scanner = new WorkspaceScanner(HOME)
    const workspaces = scanner.scan()
    const proj = workspaces.find(w => !w.isGlobal)
    expect(proj?.exists).toBe(false)
  })
})
