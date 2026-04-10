import * as fs from 'fs'
import * as path from 'path'

export class ConfigWriter {
  // per-file 串行写入队列，防止并发 read-modify-write 竞态
  private queues = new Map<string, Promise<void>>()

  private enqueue(filePath: string, fn: () => void): Promise<void> {
    const prev = this.queues.get(filePath) ?? Promise.resolve()
    const next = prev.then(() => fn(), () => fn()).finally(() => {
      // 只有当 next 仍是队列末尾时才清理，防止并发新任务时误删
      if (this.queues.get(filePath) === next) {
        this.queues.delete(filePath)
      }
    })
    this.queues.set(filePath, next)
    return next
  }

  patchJson(filePath: string, patch: Record<string, unknown>): void {
    this._patchJsonSync(filePath, patch)
  }

  patchJsonAsync(filePath: string, patch: Record<string, unknown>): Promise<void> {
    return this.enqueue(filePath, () => this._patchJsonSync(filePath, patch))
  }

  // 完整替换指定 key 的值（不做对象合并），用于 mcpServers 等需要完整覆盖的场景
  replaceFieldAsync(filePath: string, fieldName: string, value: unknown): Promise<void> {
    return this.enqueue(filePath, () => {
      const dir = path.dirname(filePath)
      const tmpPath = filePath + '.tmp'
      const bakPath = filePath + '.bak'
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      let existing: Record<string, unknown> = {}
      if (fs.existsSync(filePath)) {
        try { existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch { existing = {} }
      }
      const result = { ...existing, [fieldName]: value }
      fs.writeFileSync(tmpPath, JSON.stringify(result, null, 2), 'utf-8')
      if (fs.existsSync(filePath)) fs.copyFileSync(filePath, bakPath)
      fs.renameSync(tmpPath, filePath)
    })
  }

  private _patchJsonSync(filePath: string, patch: Record<string, unknown>): void {
    const dir = path.dirname(filePath)
    const tmpPath = filePath + '.tmp'
    const bakPath = filePath + '.bak'

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    let existing: Record<string, unknown> = {}
    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      } catch {
        existing = {}
      }
    }

    const merged: Record<string, unknown> = { ...existing }
    for (const [key, value] of Object.entries(patch)) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof existing[key] === 'object' &&
        existing[key] !== null &&
        !Array.isArray(existing[key])
      ) {
        merged[key] = { ...(existing[key] as object), ...(value as object) }
      } else {
        merged[key] = value
      }
    }

    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8')
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, bakPath)
    }
    fs.renameSync(tmpPath, filePath)
  }

  patchArrayField(
    filePath: string,
    fieldName: string,
    value: string,
    action: 'add' | 'remove'
  ): Promise<void> {
    return this.enqueue(filePath, () => {
      let existing: Record<string, unknown> = {}
      if (fs.existsSync(filePath)) {
        try {
          existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        } catch {
          existing = {}
        }
      }

      const arr: string[] = Array.isArray(existing[fieldName])
        ? [...(existing[fieldName] as string[])]
        : []

      const updated = action === 'add'
        ? arr.includes(value) ? arr : [...arr, value]
        : arr.filter(v => v !== value)

      this._patchJsonSync(filePath, { [fieldName]: updated })
    })
  }
}
