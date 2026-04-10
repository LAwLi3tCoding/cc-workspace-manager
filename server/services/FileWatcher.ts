import * as path from 'path'
import * as fs from 'fs'
import { watch, FSWatcher } from 'chokidar'
import { WorkspaceScanner } from './WorkspaceScanner'

type ChangeCallback = (workspaceId: string) => void

export class FileWatcher {
  private watcher: FSWatcher | null = null
  private callbacks: ChangeCallback[] = []
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private homeDir: string = process.env.HOME!) {}

  start(): void {
    const scanner = new WorkspaceScanner(this.homeDir)
    const workspaces = scanner.scan()

    const watchPaths: string[] = [
      path.join(this.homeDir, '.claude'),
    ]
    for (const ws of workspaces) {
      if (!ws.isGlobal) {
        watchPaths.push(path.join(ws.path, '.claude'))
        watchPaths.push(path.join(ws.path, '.mcp.json'))
      }
    }

    const validPaths = watchPaths.filter(p => fs.existsSync(p))

    if (validPaths.length === 0) return

    this.watcher = watch(validPaths, {
      ignoreInitial: true,
      persistent: true,
      depth: 2,
    })

    this.watcher.on('all', (_event: string, filePath: string) => {
      const workspaceId = this.resolveWorkspaceId(filePath, workspaces)
      this.debounce(workspaceId, () => {
        for (const cb of this.callbacks) cb(workspaceId)
      })
    })
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
  }

  onChange(cb: ChangeCallback): void {
    this.callbacks.push(cb)
  }

  private debounce(key: string, fn: () => void, ms = 300): void {
    const existing = this.debounceTimers.get(key)
    if (existing) clearTimeout(existing)
    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key)
      fn()
    }, ms))
  }

  private resolveWorkspaceId(
    filePath: string,
    workspaces: Array<{ id: string; path: string; isGlobal: boolean }>
  ): string {
    for (const ws of workspaces) {
      if (!ws.isGlobal && filePath.startsWith(ws.path)) return ws.id
    }
    return 'global'
  }
}
