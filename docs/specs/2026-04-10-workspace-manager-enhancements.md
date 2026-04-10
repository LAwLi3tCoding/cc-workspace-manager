# cc-workspace-manager 功能增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 MCP workspaceId bug、添加实时同步、优化 UI 体验、支持 MCP/Hook 创建、跨工作空间操作

**Architecture:** Express 服务端加 chokidar 文件监听 + SSE 推送；McpManager/HooksScanner 增加写入方法；前端 App.tsx 订阅 SSE 并新增 Modal 表单组件；ConfigWriter 加 per-file 串行写入队列。

**Tech Stack:** TypeScript, Express, React 18, TailwindCSS, chokidar@3

---

## 文件变更总览

### 新建文件
- `server/services/FileWatcher.ts` — chokidar 封装，监听 ~/.claude 及各项目 .claude 目录
- `server/routes/events.ts` — SSE 端点 GET /api/events
- `server/routes/copy.ts` — 跨工作空间复制 POST /api/copy

### 修改文件
- `server/services/ConfigWriter.ts` — 加 per-file Promise 串行队列
- `server/services/McpManager.ts` — 加 `create()` 方法；`setEnabled/delete` 支持 project scope
- `server/services/HooksScanner.ts` — 加 `createInSettings()` 方法（写 settings.json hooks 字段）
- `server/services/SkillScanner.ts` — 加 `symlinkBroken` 字段检测
- `server/routes/mcps.ts` — 修复 workspaceId 忽略 bug；加 POST 创建路由
- `server/routes/hooks.ts` — 加 POST 创建路由
- `server/routes/workspaces.ts` — 加 export/import 路由
- `server/index.ts` — 注册 events/copy 路由
- `server/types.ts` — McpServer 加 `url?`/`type` 字段；Skill 加 `symlinkBroken`
- `client/src/api.ts` — 加 createMcp/createHook/copyItem/exportConfig/importConfig 方法
- `client/src/App.tsx` — SSE 订阅；Modal 组件；刷新粒度优化；错误友好化
- `client/src/components/WorkspaceSidebar.tsx` — 加搜索框；⋮菜单（导出/导入）
- `client/src/components/ItemCard.tsx` — 展示 symlinkTarget；断链红色警告；复制到按钮

---

## Task 1: ConfigWriter 并发写入保护

**Files:**
- Modify: `server/services/ConfigWriter.ts`
- Test: `server/services/__tests__/ConfigWriter.test.ts`

- [ ] **Step 1: 写失败测试（并发写入不丢数据）**

在 `server/services/__tests__/ConfigWriter.test.ts` 末尾加：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ConfigWriter } from '../ConfigWriter'

describe('ConfigWriter concurrent writes', () => {
  let tmpDir: string
  let writer: ConfigWriter

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'))
    writer = new ConfigWriter()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('should not lose data under concurrent writes', async () => {
    const filePath = path.join(tmpDir, 'settings.json')
    // 10 concurrent patches to different keys
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        writer.patchJsonAsync(filePath, { [`key${i}`]: `val${i}` })
      )
    )
    const result = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    for (let i = 0; i < 10; i++) {
      expect(result[`key${i}`]).toBe(`val${i}`)
    }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/liuyi85/cc-workspace-manager && npm test -- --reporter=verbose 2>&1 | tail -20
```

预期：`patchJsonAsync is not a function` 或类似错误

- [ ] **Step 3: 实现 patchJsonAsync（串行队列）**

完整替换 `server/services/ConfigWriter.ts`：

```typescript
import * as fs from 'fs'
import * as path from 'path'

export class ConfigWriter {
  // per-file 串行写入队列，防止并发 read-modify-write 竞态
  private queues = new Map<string, Promise<void>>()

  private enqueue(filePath: string, fn: () => void): Promise<void> {
    const prev = this.queues.get(filePath) ?? Promise.resolve()
    const next = prev.then(() => fn()).catch(() => fn())
    this.queues.set(filePath, next)
    return next
  }

  patchJson(filePath: string, patch: Record<string, unknown>): void {
    this._patchJsonSync(filePath, patch)
  }

  patchJsonAsync(filePath: string, patch: Record<string, unknown>): Promise<void> {
    return this.enqueue(filePath, () => this._patchJsonSync(filePath, patch))
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
  ): void {
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

    this.patchJson(filePath, { [fieldName]: updated })
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/liuyi85/cc-workspace-manager && npm test -- --reporter=verbose 2>&1 | tail -20
```

预期：所有测试 PASS

- [ ] **Step 5: 提交**

```bash
cd /Users/liuyi85/cc-workspace-manager && git add server/services/ConfigWriter.ts server/services/__tests__/ConfigWriter.test.ts && git commit -m "fix: add per-file serial write queue to ConfigWriter to prevent concurrent write race"
```

---

## Task 2: 修复 MCP workspaceId 被忽略 bug

**Files:**
- Modify: `server/routes/mcps.ts`
- Modify: `server/services/McpManager.ts`
- Test: `server/services/__tests__/McpManager.test.ts`

- [ ] **Step 1: 写失败测试**

在 `server/services/__tests__/McpManager.test.ts` 末尾加：

```typescript
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

  it('setEnabled with project scope writes to project settings', () => {
    const mgr = new McpManager(tmpDir)
    const projDir = path.join(tmpDir, 'myproject')
    fs.mkdirSync(path.join(projDir, '.claude'), { recursive: true })
    mgr.setEnabled('projServer', true, 'project', projDir)
    const settings = JSON.parse(
      fs.readFileSync(path.join(projDir, '.claude', 'settings.json'), 'utf-8')
    )
    expect(settings.enabledMcpjsonServers).toContain('projServer')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/liuyi85/cc-workspace-manager && npm test -- --reporter=verbose 2>&1 | tail -20
```

预期：`Expected 3 arguments, but got 2` 或 assertion 失败

- [ ] **Step 3: 修改 McpManager，setEnabled/delete 支持 scope 参数**

完整替换 `server/services/McpManager.ts`：

```typescript
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
        type: (def as any).url ? 'sse' : 'stdio',
        command: def.command,
        args: def.args,
        url: (def as any).url,
        env: def.env,
        definedIn: scope,
        effective: { enabled, source: 'global' },
        overrideByEnableAll,
      })
    }

    return results
  }

  setEnabled(serverName: string, enabled: boolean, scope: 'global' | 'project' = 'global', basePath?: string): void {
    const settingsPath = scope === 'project' && basePath
      ? path.join(basePath, '.claude', 'settings.json')
      : path.join(this.homeDir, '.claude', 'settings.json')

    if (enabled) {
      this.writer.patchArrayField(settingsPath, 'enabledMcpjsonServers', serverName, 'add')
      this.writer.patchArrayField(settingsPath, 'disabledMcpjsonServers', serverName, 'remove')
    } else {
      this.writer.patchArrayField(settingsPath, 'enabledMcpjsonServers', serverName, 'remove')
      this.writer.patchArrayField(settingsPath, 'disabledMcpjsonServers', serverName, 'add')
    }
  }

  delete(serverName: string, scope: 'global' | 'project' = 'global', basePath?: string): void {
    const mcpPath = scope === 'project' && basePath
      ? path.join(basePath, '.mcp.json')
      : path.join(this.homeDir, '.claude', '.mcp.json')

    const existing = this.reader.readMcpServers(scope, basePath ?? this.homeDir)
    const { [serverName]: _removed, ...rest } = existing
    this.writer.patchJson(mcpPath, { mcpServers: rest })
  }

  create(
    serverName: string,
    config: { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
           | { type: 'sse'; url: string; env?: Record<string, string> },
    scope: 'global' | 'project' = 'global',
    basePath?: string
  ): void {
    const mcpPath = scope === 'project' && basePath
      ? path.join(basePath, '.mcp.json')
      : path.join(this.homeDir, '.claude', '.mcp.json')

    const entry = config.type === 'stdio'
      ? { command: config.command, args: config.args ?? [], env: config.env }
      : { url: config.url, env: config.env }

    const existing = this.reader.readMcpServers(scope, basePath ?? this.homeDir)
    this.writer.patchJson(mcpPath, { mcpServers: { ...existing, [serverName]: entry } })
  }
}
```

- [ ] **Step 4: 修改 server/routes/mcps.ts，正确传入 scope 和 basePath**

完整替换 `server/routes/mcps.ts`：

```typescript
import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { McpManager } from '../services/McpManager'

const router = Router()
const HOME = process.env.HOME!

function resolveWorkspace(workspaceId: string) {
  if (workspaceId === 'global') return { scope: 'global' as const, basePath: HOME }
  const ws = new WorkspaceScanner(HOME).scan().find(w => w.id === workspaceId)
  if (!ws) return null
  return { scope: 'project' as const, basePath: ws.path }
}

router.get('/:workspaceId/mcps', (req, res) => {
  try {
    const resolved = resolveWorkspace(req.params.workspaceId)
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })
    const mgr = new McpManager(HOME)
    res.json(mgr.list(resolved.scope, resolved.basePath))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post('/:workspaceId/mcps', (req, res) => {
  try {
    const resolved = resolveWorkspace(req.params.workspaceId)
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })
    const { name, type, command, args, url, env } = req.body as {
      name: string; type: 'stdio' | 'sse'; command?: string; args?: string[];
      url?: string; env?: Record<string, string>
    }
    if (!name) return res.status(400).json({ error: '`name` is required' })
    if (type !== 'stdio' && type !== 'sse') return res.status(400).json({ error: '`type` must be stdio or sse' })
    if (type === 'stdio' && !command) return res.status(400).json({ error: '`command` required for stdio' })
    if (type === 'sse' && !url) return res.status(400).json({ error: '`url` required for sse' })

    const mgr = new McpManager(HOME)
    const config = type === 'stdio'
      ? { type: 'stdio' as const, command: command!, args, env }
      : { type: 'sse' as const, url: url!, env }
    mgr.create(name, config, resolved.scope, resolved.basePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.patch('/:workspaceId/mcps/:serverName', (req, res) => {
  try {
    const resolved = resolveWorkspace(req.params.workspaceId)
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })
    const { serverName } = req.params
    const { enabled } = req.body as { enabled: boolean }
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: '`enabled` must be boolean' })
    const mgr = new McpManager(HOME)
    mgr.setEnabled(serverName, enabled, resolved.scope, resolved.basePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/mcps/:serverName', (req, res) => {
  try {
    const resolved = resolveWorkspace(req.params.workspaceId)
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })
    const { serverName } = req.params
    const mgr = new McpManager(HOME)
    mgr.delete(serverName, resolved.scope, resolved.basePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
```

- [ ] **Step 5: 更新 server/types.ts，McpServer 加 type/url 字段**

在 `server/types.ts` 的 `McpServer` interface 中修改：

```typescript
export interface McpServer {
  name: string
  type: 'stdio' | 'sse'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  definedIn: 'global' | 'project'
  effective: EffectiveState
  overrideByEnableAll: boolean
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
cd /Users/liuyi85/cc-workspace-manager && npm test -- --reporter=verbose 2>&1 | tail -30
```

预期：所有测试 PASS

- [ ] **Step 7: 提交**

```bash
cd /Users/liuyi85/cc-workspace-manager && git add server/routes/mcps.ts server/services/McpManager.ts server/services/__tests__/McpManager.test.ts server/types.ts && git commit -m "fix: respect workspaceId in MCP routes, add create() method, support project scope"
```

---

## Task 3: SSE 实时同步（chokidar + FileWatcher + /api/events）

**Files:**
- Create: `server/services/FileWatcher.ts`
- Create: `server/routes/events.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 安装 chokidar**

```bash
cd /Users/liuyi85/cc-workspace-manager && npm install chokidar && npm install --save-dev @types/chokidar 2>&1 | tail -5
```

预期：`added N packages`

- [ ] **Step 2: 创建 FileWatcher 服务**

新建 `server/services/FileWatcher.ts`：

```typescript
import * as path from 'path'
import * as chokidar from 'chokidar'
import { WorkspaceScanner } from './WorkspaceScanner'

type ChangeCallback = (workspaceId: string) => void

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null
  private callbacks: ChangeCallback[] = []
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private homeDir: string = process.env.HOME!) {}

  start(): void {
    const scanner = new WorkspaceScanner(this.homeDir)
    const workspaces = scanner.scan()

    // 收集所有要监听的路径
    const watchPaths: string[] = [
      path.join(this.homeDir, '.claude'),
    ]
    for (const ws of workspaces) {
      if (!ws.isGlobal) {
        watchPaths.push(path.join(ws.path, '.claude'))
        watchPaths.push(path.join(ws.path, '.mcp.json'))
      }
    }

    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      depth: 2,
    })

    this.watcher.on('all', (_event, filePath) => {
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
```

- [ ] **Step 3: 创建 SSE 路由**

新建 `server/routes/events.ts`：

```typescript
import { Router, Request, Response } from 'express'
import { FileWatcher } from '../services/FileWatcher'

const router = Router()
const HOME = process.env.HOME!

// 单例 FileWatcher，服务启动时初始化
let watcher: FileWatcher | null = null
const clients = new Set<Response>()

export function initFileWatcher(): void {
  watcher = new FileWatcher(HOME)
  watcher.onChange((workspaceId) => {
    const data = JSON.stringify({ type: 'workspace-changed', workspaceId })
    for (const client of clients) {
      client.write(`data: ${data}\n\n`)
    }
  })
  watcher.start()
}

router.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // 发送初始心跳
  res.write(': connected\n\n')
  clients.add(res)

  // 每 25 秒发送心跳防止超时
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n')
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(res)
  })
})

export default router
```

- [ ] **Step 4: 在 server/index.ts 注册 events 路由**

在 `server/index.ts` 中，import 区域加：

```typescript
import eventsRouter, { initFileWatcher } from './routes/events'
```

在 `app.use('/api/workspaces', hooksRouter)` 后加：

```typescript
app.use('/api/events', eventsRouter)

// 启动文件监听
initFileWatcher()
```

- [ ] **Step 5: 提交**

```bash
cd /Users/liuyi85/cc-workspace-manager && git add server/services/FileWatcher.ts server/routes/events.ts server/index.ts package.json package-lock.json && git commit -m "feat: add SSE real-time sync with chokidar file watcher"
```

---

## Task 4: 前端订阅 SSE + 刷新粒度优化 + 错误友好化

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/api.ts`

- [ ] **Step 1: api.ts 加 createMcp 方法**

在 `client/src/api.ts` 的 `api` 对象末尾（`checkUpdate` 之前）加：

```typescript
  createMcp: (
    workspaceId: string,
    data: {
      name: string
      type: 'stdio' | 'sse'
      command?: string
      args?: string[]
      url?: string
      env?: Record<string, string>
    }
  ) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/mcps`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
```

- [ ] **Step 2: App.tsx — SSE 订阅 + 刷新粒度优化 + 错误友好化**

在 `App.tsx` 的 `export default function App()` 内，`useEffect` 初始化块（第103行）之后加 SSE 订阅 effect：

```typescript
  // SSE 实时同步
  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; workspaceId: string }
        if (msg.type === 'workspace-changed' && msg.workspaceId === selectedId) {
          if (selectedId) loadTabData(selectedId, activeTab)
        }
      } catch { /* ignore malformed */ }
    }
    return () => es.close()
  }, [selectedId, activeTab, loadTabData])
```

将 `refresh` 函数（第156行）改为只刷新当前 Tab：

```typescript
  const refresh = () => {
    if (selectedId) loadTabData(selectedId, activeTab)
  }
```

将所有 `.catch(e => setError(String(e)))` 改为解析 server 错误格式：

```typescript
  // 在 App() 顶部加辅助函数
  const extractError = (e: unknown): string => {
    if (e instanceof Error) return e.message
    return String(e)
  }
```

然后将 `loadAllData`、`loadTabData`、`confirmDelete` 中的 `setError(String(e))` 全部改为 `setError(extractError(e))`。

初始化 effect 中的 `.catch(e => setError(String(e)))` 也改为 `setError(extractError(e))`。

- [ ] **Step 3: 提交**

```bash
cd /Users/liuyi85/cc-workspace-manager && git add client/src/App.tsx client/src/api.ts && git commit -m "feat: subscribe SSE for auto-refresh, optimize refresh granularity, improve error messages"
```

---

## Task 5: 侧边栏搜索 + Skill symlink 展示

**Files:**
- Modify: `client/src/components/WorkspaceSidebar.tsx`
- Modify: `client/src/components/ItemCard.tsx`
- Modify: `server/services/SkillScanner.ts`
- Modify: `server/types.ts`

- [ ] **Step 1: server/types.ts — Skill 加 symlinkBroken 字段**

将 `Skill` interface 改为：

```typescript
export interface Skill {
  name: string
  description: string
  scope: 'global' | 'project'
  path: string
  isSymlink: boolean
  symlinkTarget?: string
  symlinkBroken?: boolean
}
```

- [ ] **Step 2: 读取 SkillScanner，加 symlinkBroken 检测**

先读取文件：`server/services/SkillScanner.ts`

然后在构建 Skill 对象时（`isSymlink: lstat.isSymbolicLink()` 附近），加：

```typescript
let symlinkTarget: string | undefined
let symlinkBroken: boolean | undefined
if (lstat.isSymbolicLink()) {
  try {
    symlinkTarget = fs.readlinkSync(fullPath)
    // 检查目标是否存在
    const resolvedTarget = path.isAbsolute(symlinkTarget)
      ? symlinkTarget
      : path.resolve(path.dirname(fullPath), symlinkTarget)
    symlinkBroken = !fs.existsSync(resolvedTarget)
  } catch {
    symlinkBroken = true
  }
}
```

并在返回的 Skill 对象中加 `symlinkTarget, symlinkBroken`。

- [ ] **Step 3: WorkspaceSidebar — 加搜索框**

完整替换 `client/src/components/WorkspaceSidebar.tsx`：

```typescript
import { useState } from 'react'
import type { Workspace } from '../../../server/types'

interface Props {
  workspaces: Workspace[]
  selected: string | null
  onSelect: (id: string) => void
  loading: boolean
}

function WorkspaceIcon({ isGlobal, name }: { isGlobal: boolean; name: string }) {
  if (isGlobal) {
    return (
      <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
        <span className="text-blue-400 text-xs">⬡</span>
      </div>
    )
  }
  const initial = name.charAt(0).toUpperCase()
  const colors = ['bg-violet-500/20 text-violet-400', 'bg-emerald-500/20 text-emerald-400',
    'bg-orange-500/20 text-orange-400', 'bg-pink-500/20 text-pink-400',
    'bg-cyan-500/20 text-cyan-400', 'bg-yellow-500/20 text-yellow-400']
  const color = colors[initial.charCodeAt(0) % colors.length]
  return (
    <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
      <span className="text-xs font-bold font-mono">{initial}</span>
    </div>
  )
}

export function WorkspaceSidebar({ workspaces, selected, onSelect, loading }: Props) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? workspaces.filter(ws =>
        ws.name.toLowerCase().includes(query.toLowerCase()) ||
        ws.path.toLowerCase().includes(query.toLowerCase())
      )
    : workspaces

  return (
    <aside className="w-60 shrink-0 flex flex-col" style={{ background: 'var(--sidebar-bg)' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">CC</span>
          </div>
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--sidebar-text)' }}>
            Workspaces
          </span>
        </div>
        {/* 搜索框 */}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索工作空间..."
          className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white/10 border border-white/10 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-400/50"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading && (
          <div className="px-4 py-2 space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton h-8 w-full opacity-20" />
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-3 text-xs text-slate-500">未找到匹配的工作空间</p>
        )}
        {filtered.map(ws => (
          <button
            key={ws.id}
            onClick={() => onSelect(ws.id)}
            className={`ws-item w-full text-left px-3 py-2 flex items-center gap-2.5 ${
              selected === ws.id ? 'active' : ''
            }`}
          >
            <WorkspaceIcon isGlobal={ws.isGlobal} name={ws.name} />
            <div className="min-w-0">
              <div className={`text-xs font-medium truncate ${
                selected === ws.id ? 'text-slate-100' : 'text-slate-400'
              }`}>
                {ws.name}
              </div>
              {ws.isGlobal && (
                <div className="text-[10px] font-mono" style={{ color: 'var(--sidebar-text)' }}>
                  global
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <p className="text-[10px] font-mono" style={{ color: 'var(--sidebar-text)' }}>
          {filtered.length}/{workspaces.length} workspaces
        </p>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: ItemCard — 展示 symlinkTarget，断链红色警告**

先读取 `client/src/components/ItemCard.tsx`，找到展示 badge 的区域（`isSymlink` 相关），在 symlink badge 后加：

```typescript
{item.symlinkTarget && (
  <span
    className={`text-[10px] font-mono truncate max-w-[180px] ${
      item.symlinkBroken ? 'text-red-400' : 'text-slate-400'
    }`}
    title={item.symlinkTarget}
  >
    {item.symlinkBroken ? '⚠ 断链: ' : '→ '}{item.symlinkTarget}
  </span>
)}
```

- [ ] **Step 5: 运行测试**

```bash
cd /Users/liuyi85/cc-workspace-manager && npm test -- --reporter=verbose 2>&1 | tail -20
```

预期：所有测试 PASS

- [ ] **Step 6: 提交**

```bash
cd /Users/liuyi85/cc-workspace-manager && git add client/src/components/WorkspaceSidebar.tsx client/src/components/ItemCard.tsx server/services/SkillScanner.ts server/types.ts && git commit -m "feat: add sidebar search, show skill symlink target with broken-link warning"
```

---

## Task 6: MCP 创建 Modal + Hook 创建 Modal

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `server/routes/hooks.ts`
- Modify: `server/services/HooksScanner.ts`
- Modify: `client/src/api.ts`

- [ ] **Step 1: HooksScanner — 加 createInSettings 方法**

在 `server/services/HooksScanner.ts` 末尾（`delete` 方法后）加：

```typescript
  createInSettings(
    settingsPath: string,
    event: string,
    matcher: string,
    command: string
  ): void {
    const writer = new (require('./ConfigWriter').ConfigWriter)()
    // hooks 字段结构: { [event]: [ { matcher: { tool_name: matcher }, hooks: [{ type: 'command', command }] } ] }
    let existing: Record<string, unknown> = {}
    if (fs.existsSync(settingsPath)) {
      try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) } catch { existing = {} }
    }
    const hooks = (existing.hooks as Record<string, unknown[]> | undefined) ?? {}
    const eventHooks: unknown[] = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : []
    eventHooks.push({
      matcher: matcher === '*' ? {} : { tool_name: matcher },
      hooks: [{ type: 'command', command }],
    })
    writer.patchJson(settingsPath, { hooks: { ...hooks, [event]: eventHooks } })
  }
```

在文件顶部加 import：`import * as path from 'path'`（如果还没有）。

- [ ] **Step 2: hooks 路由 — 加 POST 创建**

在 `server/routes/hooks.ts` 的 `router.delete` 之前加：

```typescript
router.post('/:workspaceId/hooks', (req, res) => {
  try {
    const { workspaceId } = req.params
    const { event, matcher, command, scope } = req.body as {
      event: string; matcher: string; command: string; scope: 'global' | 'project'
    }
    if (!event || !command) return res.status(400).json({ error: '`event` and `command` are required' })

    const scanner = new HooksScanner(HOME)
    let settingsPath: string
    if (scope === 'global' || workspaceId === 'global') {
      settingsPath = require('path').join(HOME, '.claude', 'settings.json')
    } else {
      const ws = new WorkspaceScanner(HOME).scan().find(w => w.id === workspaceId)
      if (!ws) return res.status(404).json({ error: 'Workspace not found' })
      settingsPath = require('path').join(ws.path, '.claude', 'settings.json')
    }
    scanner.createInSettings(settingsPath, event, matcher ?? '*', command)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
```

- [ ] **Step 3: api.ts — 加 createHook 方法**

在 `client/src/api.ts` 的 `api` 对象中加：

```typescript
  createHook: (
    workspaceId: string,
    data: { event: string; matcher: string; command: string; scope: 'global' | 'project' }
  ) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/hooks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
```

- [ ] **Step 4: App.tsx — 添加 AddMcpModal 组件**

在 `App.tsx` 的 `HookCard` 组件定义之后、`export default function App()` 之前，加：

```typescript
// ── Add MCP Modal ─────────────────────────────────────────────────────────────
function AddMcpModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState<'stdio' | 'sse'>('stdio')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [envStr, setEnvStr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const parseEnv = (s: string): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const line of s.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    return result
  }

  const submit = async () => {
    if (!name.trim()) { setError('名称不能为空'); return }
    if (type === 'stdio' && !command.trim()) { setError('命令不能为空'); return }
    if (type === 'sse' && !url.trim()) { setError('URL 不能为空'); return }
    setSaving(true)
    try {
      await api.createMcp(workspaceId, {
        name: name.trim(),
        type,
        command: type === 'stdio' ? command.trim() : undefined,
        args: type === 'stdio' && args.trim() ? args.trim().split(/\s+/) : undefined,
        url: type === 'sse' ? url.trim() : undefined,
        env: envStr.trim() ? parseEnv(envStr) : undefined,
      })
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-800 mb-4">添加 MCP 服务器</h2>
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">名称</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="my-mcp-server" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">类型</label>
            <div className="flex gap-3">
              {(['stdio', 'sse'] as const).map(t => (
                <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={type === t} onChange={() => setType(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          {type === 'stdio' ? (
            <>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">命令</label>
                <input value={command} onChange={e => setCommand(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
                  placeholder="uvx mcp-server-name" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">参数（空格分隔，可选）</label>
                <input value={args} onChange={e => setArgs(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
                  placeholder="--port 8080" />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">URL</label>
              <input value={url} onChange={e => setUrl(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
                placeholder="http://localhost:3000/sse" />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">环境变量（每行 KEY=VALUE，可选）</label>
            <textarea value={envStr} onChange={e => setEnvStr(e.target.value)} rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-400"
              placeholder={'API_KEY=xxx\nDEBUG=1'} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">取消</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
            {saving ? '保存中...' : '添加'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Hook Modal ────────────────────────────────────────────────────────────
const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'Stop', 'Notification', 'SubagentStop']

function AddHookModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [event, setEvent] = useState(HOOK_EVENTS[0])
  const [matcher, setMatcher] = useState('*')
  const [command, setCommand] = useState('')
  const [scope, setScope] = useState<'global' | 'project'>(
    workspaceId === 'global' ? 'global' : 'project'
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!command.trim()) { setError('命令不能为空'); return }
    setSaving(true)
    try {
      await api.createHook(workspaceId, { event, matcher: matcher || '*', command: command.trim(), scope })
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-800 mb-4">添加 Hook</h2>
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">事件类型</label>
            <select value={event} onChange={e => setEvent(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
              {HOOK_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">匹配器（工具名或 * 匹配全部）</label>
            <input value={matcher} onChange={e => setMatcher(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
              placeholder="* 或 Bash" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">命令</label>
            <input value={command} onChange={e => setCommand(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400"
              placeholder="echo hello" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Scope</label>
            <div className="flex gap-3">
              {(['global', 'project'] as const).map(s => (
                <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={scope === s} onChange={() => setScope(s)}
                    disabled={workspaceId === 'global' && s === 'project'} />
                  {s}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">取消</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
            {saving ? '保存中...' : '添加'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: App.tsx — 在 App() 中加 Modal 状态和触发按钮**

在 `App()` 的 state 声明区加：

```typescript
  const [showAddMcp, setShowAddMcp] = useState(false)
  const [showAddHook, setShowAddHook] = useState(false)
```

在 MCP Tab 的标题行（TabBar 下方的 header 区域）加"+ 添加 MCP"按钮，在 Hooks Tab 加"+ 添加 Hook"按钮。找到渲染 TabBar 的 JSX，在其后的内容区域顶部加：

```typescript
{activeTab === 'mcps' && (
  <div className="flex justify-end mb-3">
    <button onClick={() => setShowAddMcp(true)}
      className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1">
      + 添加 MCP
    </button>
  </div>
)}
{activeTab === 'hooks' && (
  <div className="flex justify-end mb-3">
    <button onClick={() => setShowAddHook(true)}
      className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-1">
      + 添加 Hook
    </button>
  </div>
)}
```

在 JSX 返回值末尾（`</div>` 之前）加 Modal 渲染：

```typescript
{showAddMcp && selectedId && (
  <AddMcpModal
    workspaceId={selectedId}
    onClose={() => setShowAddMcp(false)}
    onCreated={() => selectedId && loadTabData(selectedId, 'mcps')}
  />
)}
{showAddHook && selectedId && (
  <AddHookModal
    workspaceId={selectedId}
    onClose={() => setShowAddHook(false)}
    onCreated={() => selectedId && loadTabData(selectedId, 'hooks')}
  />
)}
```

- [ ] **Step 6: 运行测试**

```bash
cd /Users/liuyi85/cc-workspace-manager && npm test -- --reporter=verbose 2>&1 | tail -20
```

预期：所有测试 PASS

- [ ] **Step 7: 提交**

```bash
cd /Users/liuyi85/cc-workspace-manager && git add client/src/App.tsx client/src/api.ts server/routes/hooks.ts server/services/HooksScanner.ts && git commit -m "feat: add MCP creation modal (stdio+sse) and Hook creation modal"
```

---

## Task 7: 跨工作空间操作（单项复制 + 导出/导入）

**Files:**
- Create: `server/routes/copy.ts`
- Modify: `server/routes/workspaces.ts`
- Modify: `server/index.ts`
- Modify: `client/src/api.ts`
- Modify: `client/src/components/WorkspaceSidebar.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: 读取 server/routes/workspaces.ts**

先读取该文件了解现有结构，然后继续。

- [ ] **Step 2: 创建 copy 路由**

新建 `server/routes/copy.ts`：

```typescript
import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { McpManager } from '../services/McpManager'
import { PluginManager } from '../services/PluginManager'

const router = Router()
const HOME = process.env.HOME!

router.post('/', (req, res) => {
  try {
    const { type, itemName, sourceWorkspaceId, targetWorkspaceId } = req.body as {
      type: 'mcp' | 'plugin'
      itemName: string
      sourceWorkspaceId: string
      targetWorkspaceId: string
    }
    if (!type || !itemName || !sourceWorkspaceId || !targetWorkspaceId) {
      return res.status(400).json({ error: 'type, itemName, sourceWorkspaceId, targetWorkspaceId are required' })
    }

    const scanner = new WorkspaceScanner(HOME)
    const workspaces = scanner.scan()

    const resolveWs = (id: string) => id === 'global'
      ? { scope: 'global' as const, basePath: HOME }
      : (() => {
          const ws = workspaces.find(w => w.id === id)
          if (!ws) return null
          return { scope: 'project' as const, basePath: ws.path }
        })()

    const src = resolveWs(sourceWorkspaceId)
    const tgt = resolveWs(targetWorkspaceId)
    if (!src) return res.status(404).json({ error: 'Source workspace not found' })
    if (!tgt) return res.status(404).json({ error: 'Target workspace not found' })

    if (type === 'mcp') {
      const mgr = new McpManager(HOME)
      const servers = mgr.list(src.scope, src.basePath)
      const server = servers.find(s => s.name === itemName)
      if (!server) return res.status(404).json({ error: 'MCP server not found' })
      const config = server.type === 'sse'
        ? { type: 'sse' as const, url: server.url!, env: server.env }
        : { type: 'stdio' as const, command: server.command!, args: server.args, env: server.env }
      mgr.create(itemName, config, tgt.scope, tgt.basePath)
    } else {
      return res.status(400).json({ error: 'Plugin copy not supported yet' })
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
```

- [ ] **Step 3: workspaces 路由加 export/import**

在 `server/routes/workspaces.ts` 末尾（`export default router` 之前）加：

```typescript
// 导出工作空间配置（MCPs）
router.get('/:workspaceId/export', (req, res) => {
  try {
    const { workspaceId } = req.params
    const ws = workspaceId === 'global'
      ? { scope: 'global' as const, basePath: HOME, name: 'global' }
      : (() => {
          const found = scanner.scan().find(w => w.id === workspaceId)
          if (!found) return null
          return { scope: 'project' as const, basePath: found.path, name: found.name }
        })()
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    const { McpManager } = require('../services/McpManager')
    const mgr = new McpManager(HOME)
    const mcps = mgr.list(ws.scope, ws.basePath)

    const exportData = {
      workspace: ws.name,
      exportedAt: new Date().toISOString(),
      mcps: mcps.map(({ name, type, command, args, url, env }) => ({ name, type, command, args, url, env })),
    }

    res.setHeader('Content-Disposition', `attachment; filename="${ws.name}-config.json"`)
    res.setHeader('Content-Type', 'application/json')
    res.json(exportData)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// 导入工作空间配置
router.post('/:workspaceId/import', (req, res) => {
  try {
    const { workspaceId } = req.params
    const resolved = workspaceId === 'global'
      ? { scope: 'global' as const, basePath: HOME }
      : (() => {
          const found = scanner.scan().find(w => w.id === workspaceId)
          if (!found) return null
          return { scope: 'project' as const, basePath: found.path }
        })()
    if (!resolved) return res.status(404).json({ error: 'Workspace not found' })

    const { mcps } = req.body as {
      mcps?: Array<{ name: string; type: 'stdio' | 'sse'; command?: string; args?: string[]; url?: string; env?: Record<string, string> }>
    }

    const { McpManager } = require('../services/McpManager')
    const mgr = new McpManager(HOME)
    let imported = 0
    for (const mcp of mcps ?? []) {
      if (!mcp.name || !mcp.type) continue
      const config = mcp.type === 'sse'
        ? { type: 'sse' as const, url: mcp.url!, env: mcp.env }
        : { type: 'stdio' as const, command: mcp.command!, args: mcp.args, env: mcp.env }
      mgr.create(mcp.name, config, resolved.scope, resolved.basePath)
      imported++
    }

    res.json({ ok: true, imported })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
```

- [ ] **Step 4: server/index.ts 注册 copy 路由**

在 `server/index.ts` 中加 import：

```typescript
import copyRouter from './routes/copy'
```

在路由注册区加：

```typescript
app.use('/api/copy', copyRouter)
```

- [ ] **Step 5: api.ts 加 copyItem / exportConfig / importConfig**

在 `client/src/api.ts` 的 `api` 对象中加：

```typescript
  copyItem: (data: {
    type: 'mcp' | 'plugin'
    itemName: string
    sourceWorkspaceId: string
    targetWorkspaceId: string
  }) =>
    request<{ ok: boolean }>('/copy', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  exportConfig: (workspaceId: string) =>
    request<{ workspace: string; exportedAt: string; mcps: unknown[] }>(
      `/workspaces/${workspaceId}/export`
    ),

  importConfig: (workspaceId: string, data: { mcps: unknown[] }) =>
    request<{ ok: boolean; imported: number }>(`/workspaces/${workspaceId}/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
```

- [ ] **Step 6: WorkspaceSidebar — 加 ⋮ 菜单（导出/导入）**

在 `WorkspaceSidebar.tsx` 中，每个 workspace 按钮旁加 ⋮ 菜单按钮。在 `Props` 中加：

```typescript
  onExport: (id: string) => void
  onImport: (id: string) => void
```

在每个 workspace 按钮的 `</button>` 之后加：

```typescript
<div className="relative flex-shrink-0">
  <button
    onClick={e => { e.stopPropagation(); setMenuOpen(ws.id === menuOpen ? null : ws.id) }}
    className="p-1 text-slate-500 hover:text-slate-300 rounded"
  >⋮</button>
  {menuOpen === ws.id && (
    <div className="absolute right-0 top-6 z-10 bg-slate-800 border border-slate-700 rounded-lg shadow-lg text-xs w-32">
      <button onClick={() => { onExport(ws.id); setMenuOpen(null) }}
        className="w-full text-left px-3 py-2 hover:bg-slate-700 text-slate-300">导出配置</button>
      <button onClick={() => { onImport(ws.id); setMenuOpen(null) }}
        className="w-full text-left px-3 py-2 hover:bg-slate-700 text-slate-300">从 JSON 导入</button>
    </div>
  )}
</div>
```

在 `WorkspaceSidebar` 组件内加 state：`const [menuOpen, setMenuOpen] = useState<string | null>(null)`

- [ ] **Step 7: App.tsx — 处理导出/导入逻辑**

在 `App()` 中加导出处理函数：

```typescript
  const handleExport = async (workspaceId: string) => {
    try {
      const data = await api.exportConfig(workspaceId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.workspace}-config.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleImport = (workspaceId: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const result = await api.importConfig(workspaceId, { mcps: data.mcps ?? [] })
        alert(`导入成功：${result.imported} 个 MCP 服务器`)
        if (workspaceId === selectedId) loadTabData(workspaceId, 'mcps')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
    input.click()
  }
```

将 `WorkspaceSidebar` 组件调用更新，传入 `onExport={handleExport}` 和 `onImport={handleImport}`。

- [ ] **Step 8: ItemCard — 加"复制到..."按钮**

在 `ItemCard.tsx` 中，找到删除按钮区域，加"复制到..."按钮（仅 MCP 和 Plugin 类型显示）。在 `Props` 中加 `onCopy?: () => void`，在删除按钮旁加：

```typescript
{onCopy && (
  <button onClick={onCopy}
    className="p-1.5 text-slate-300 hover:text-blue-400 hover:bg-blue-50 transition-colors rounded-lg"
    title="复制到其他工作空间">
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  </button>
)}
```

在 `App.tsx` 中，渲染 MCP 卡片时传入 `onCopy`，弹出工作空间选择器（简单 `prompt` 或 select modal）并调用 `api.copyItem`。

- [ ] **Step 9: 运行测试**

```bash
cd /Users/liuyi85/cc-workspace-manager && npm test -- --reporter=verbose 2>&1 | tail -20
```

预期：所有测试 PASS

- [ ] **Step 10: 提交**

```bash
cd /Users/liuyi85/cc-workspace-manager && git add server/routes/copy.ts server/routes/workspaces.ts server/index.ts client/src/api.ts client/src/components/WorkspaceSidebar.tsx client/src/App.tsx client/src/components/ItemCard.tsx && git commit -m "feat: cross-workspace copy, export/import config JSON"
```

---

## Spec 自检结果

- [x] Bug 修复（MCP workspaceId、ConfigWriter 竞态）— Task 1-2 覆盖
- [x] SSE 实时同步 — Task 3-4 覆盖
- [x] 侧边栏搜索 — Task 5 覆盖
- [x] Skill symlink 展示 — Task 5 覆盖
- [x] 错误信息友好化 — Task 4 覆盖
- [x] 刷新粒度优化 — Task 4 覆盖
- [x] MCP 创建（stdio + SSE）— Task 6 覆盖
- [x] Hook 创建 — Task 6 覆盖
- [x] 跨工作空间单项复制 — Task 7 覆盖
- [x] 全量导出/导入 — Task 7 覆盖
- [x] 无占位符、无 TBD、无矛盾
- [x] 类型签名一致（McpServer.type/url/command 在 Task 2 定义，Task 7 复用）
