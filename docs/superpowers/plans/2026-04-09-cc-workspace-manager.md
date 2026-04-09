# Claude Code Workspace Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地 Web App，可视化管理所有 Claude Code 工作空间中的 skill、MCP server 和 plugin 的启用/禁用/删除。

**Architecture:** Express + TypeScript 后端提供 REST API，读写 `~/.claude/` 下的配置文件（settings.json、.mcp.json、installed_plugins.json、skills 目录）；Vite + React 前端展示工作空间列表和配置状态；所有写操作使用原子写（tmp → rename）+ 备份策略，防止配置损坏。

**Tech Stack:** Node.js 18+, TypeScript, Express, Vite, React, TailwindCSS, concurrently, vitest

---

## File Map

### Server
- `server/index.ts` — Express 入口，注册路由，启动 HTTP server（port 3001）
- `server/types.ts` — 所有共享 TypeScript 类型（Workspace, Skill, McpServer, Plugin, EffectiveState）
- `server/services/WorkspaceScanner.ts` — 扫描 `~/.claude/projects/`，解码 slug→路径，验证存在性
- `server/services/ConfigReader.ts` — 读取并合并多层 settings.json，计算 effectiveEnabled + overriddenBy
- `server/services/ConfigWriter.ts` — 原子写：read→patch→写 tmp→rename→保留 .bak
- `server/services/SkillScanner.ts` — 扫描 skills/ 目录，处理 symlink，读 SKILL.md frontmatter
- `server/services/McpManager.ts` — 合并 .mcp.json 定义 + settings enabledMcpjsonServers，处理 enableAllProjectMcpServers
- `server/services/PluginManager.ts` — 合并 installed_plugins.json + enabledPlugins + blocklist，多 scope 合并
- `server/routes/workspaces.ts` — GET /api/workspaces
- `server/routes/skills.ts` — GET /api/workspaces/:id/skills, DELETE /api/workspaces/:id/skills/:name
- `server/routes/mcps.ts` — GET /api/workspaces/:id/mcps, PATCH /api/workspaces/:id/mcps/:name, DELETE /api/workspaces/:id/mcps/:name
- `server/routes/plugins.ts` — GET /api/workspaces/:id/plugins, PATCH /api/workspaces/:id/plugins/:key, DELETE /api/workspaces/:id/plugins/:key

### Client
- `client/src/main.tsx` — React 入口
- `client/src/App.tsx` — 根组件，WorkspaceSidebar + 主内容区
- `client/src/api.ts` — fetch 封装，所有 API 调用
- `client/src/components/WorkspaceSidebar.tsx` — 左侧工作空间列表
- `client/src/components/TabBar.tsx` — Skills / MCPs / Plugins 三个 tab
- `client/src/components/ItemCard.tsx` — 通用卡片：名称、状态徽章、toggle、删除按钮
- `client/src/components/ScopeLabel.tsx` — 显示"全局 / 项目级覆盖"标注徽章

### Config
- `package.json` — 根 package，scripts: dev（concurrently）、build、test
- `server/tsconfig.json` — server TypeScript 配置
- `client/vite.config.ts` — Vite 配置，proxy /api → localhost:3001

### Tests
- `server/services/__tests__/WorkspaceScanner.test.ts`
- `server/services/__tests__/ConfigReader.test.ts`
- `server/services/__tests__/ConfigWriter.test.ts`
- `server/services/__tests__/McpManager.test.ts`
- `server/services/__tests__/PluginManager.test.ts`

---

## Task 1: 项目脚手架与依赖安装

**Files:**
- Create: `package.json`
- Create: `server/tsconfig.json`
- Create: `server/index.ts`（占位）
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`（占位）

- [ ] **Step 1: 初始化根 package.json**

```bash
cd /Users/liuyi85/cc-workspace-manager
npm init -y
```

- [ ] **Step 2: 安装 server 依赖**

```bash
npm install express cors
npm install -D typescript @types/node @types/express @types/cors ts-node nodemon vitest concurrently
```

- [ ] **Step 3: 安装 client 依赖**

```bash
npm install -D vite @vitejs/plugin-react react react-dom @types/react @types/react-dom tailwindcss autoprefixer postcss
```

- [ ] **Step 4: 写根 package.json scripts**

完整内容（覆盖写）：

```json
{
  "name": "cc-workspace-manager",
  "version": "1.0.0",
  "scripts": {
    "dev": "concurrently \"npm run server:dev\" \"npm run client:dev\"",
    "server:dev": "nodemon --watch server --ext ts --exec ts-node server/index.ts",
    "client:dev": "vite client",
    "build": "tsc -p server/tsconfig.json && vite build client",
    "test": "vitest run server"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.4.0",
    "concurrently": "^8.0.0",
    "nodemon": "^3.0.0",
    "postcss": "^8.4.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "tailwindcss": "^3.4.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 5: 写 server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist/server",
    "rootDir": "server",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["server/**/*"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: 写 client/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'client',
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
```

- [ ] **Step 7: 写 client/index.html**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CC Workspace Manager</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 8: 写占位 server/index.ts**

```typescript
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001')
})
```

- [ ] **Step 9: 写占位 client/src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div>CC Workspace Manager - Loading...</div>
  </React.StrictMode>
)
```

- [ ] **Step 10: 验证启动**

```bash
npm run dev
```

预期：终端显示 `Server running on http://localhost:3001`，浏览器打开 `http://localhost:3000` 显示 "Loading..."

- [ ] **Step 11: Commit**

```bash
git init
git add .
git commit -m "chore: project scaffold with Express + Vite + React"
```

---

## Task 2: 共享类型定义

**Files:**
- Create: `server/types.ts`

- [ ] **Step 1: 写 server/types.ts**

```typescript
export interface Workspace {
  id: string           // slug，如 "-Users-liuyi85-incentive-claude"
  path: string         // 实际路径，如 "/Users/liuyi85/incentive-claude"
  name: string         // 显示名，取路径最后一段
  isGlobal: boolean    // true 表示 ~/.claude/ 全局工作空间
  exists: boolean      // 路径在文件系统上是否存在
}

export type EffectiveSource = 'global' | 'project' | 'local' | 'blocklist'

export interface EffectiveState {
  enabled: boolean
  source: EffectiveSource   // 实际生效的层级
  overrides?: {             // 如果被覆盖，记录被哪层覆盖
    source: EffectiveSource
    value: boolean
  }
}

export interface Skill {
  name: string
  description: string
  scope: 'global' | 'project'
  path: string              // 目录绝对路径
  isSymlink: boolean
  symlinkTarget?: string    // symlink 指向的路径
}

export interface McpServer {
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  definedIn: 'global' | 'project'   // .mcp.json 来源
  effective: EffectiveState
  overrideByEnableAll: boolean       // enableAllProjectMcpServers=true 时为 true
}

export interface Plugin {
  key: string              // "name@marketplace"，如 "superpowers@claude-plugins-official"
  name: string
  marketplace: string
  version: string
  scope: 'user' | 'project' | 'local'
  installPath: string
  projectPath?: string     // scope=project 时有值
  effective: EffectiveState
  blocklisted: boolean
  blocklistReason?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add server/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: WorkspaceScanner 服务

**Files:**
- Create: `server/services/WorkspaceScanner.ts`
- Create: `server/services/__tests__/WorkspaceScanner.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// server/services/__tests__/WorkspaceScanner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run server/services/__tests__/WorkspaceScanner.test.ts
```

预期：FAIL — `WorkspaceScanner` not found

- [ ] **Step 3: 实现 WorkspaceScanner**

```typescript
// server/services/WorkspaceScanner.ts
import * as fs from 'fs'
import * as path from 'path'
import { Workspace } from '../types'

export class WorkspaceScanner {
  constructor(private homeDir: string = process.env.HOME || '/Users/' + process.env.USER) {}

  scan(): Workspace[] {
    const workspaces: Workspace[] = []

    // 全局工作空间
    workspaces.push({
      id: 'global',
      path: path.join(this.homeDir, '.claude'),
      name: 'Global (~/.claude)',
      isGlobal: true,
      exists: true,
    })

    // 从 ~/.claude/projects/ 读取历史工作空间
    const projectsDir = path.join(this.homeDir, '.claude', 'projects')
    let slugs: string[] = []
    try {
      slugs = fs.readdirSync(projectsDir) as string[]
    } catch {
      return workspaces
    }

    for (const slug of slugs) {
      const decoded = this.decodeSlug(slug)
      if (!decoded) continue
      const exists = fs.existsSync(decoded)
      workspaces.push({
        id: slug,
        path: decoded,
        name: path.basename(decoded),
        isGlobal: false,
        exists,
      })
    }

    return workspaces
  }

  // slug 规则：路径的 "/" 替换为 "-"，开头的 "-" 对应根 "/"
  // 例："-Users-liuyi85-my-project" → "/Users/liuyi85/my-project"
  private decodeSlug(slug: string): string | null {
    if (!slug.startsWith('-')) return null
    // 将 slug 中的 "-" 替换为 "/"，开头的 "-" 变成 "/"
    const decoded = slug.replace(/-/g, '/')
    return decoded
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run server/services/__tests__/WorkspaceScanner.test.ts
```

预期：PASS 3 tests

- [ ] **Step 5: Commit**

```bash
git add server/services/WorkspaceScanner.ts server/services/__tests__/WorkspaceScanner.test.ts
git commit -m "feat: add WorkspaceScanner service"
```

---

## Task 4: ConfigReader 服务（多层配置合并）

**Files:**
- Create: `server/services/ConfigReader.ts`
- Create: `server/services/__tests__/ConfigReader.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// server/services/__tests__/ConfigReader.test.ts
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run server/services/__tests__/ConfigReader.test.ts
```

预期：FAIL — `ConfigReader` not found

- [ ] **Step 3: 实现 ConfigReader**

```typescript
// server/services/ConfigReader.ts
import * as fs from 'fs'
import * as path from 'path'
import { EffectiveState } from '../types'

interface SettingsJson {
  enabledPlugins?: Record<string, boolean>
  enabledMcpjsonServers?: string[]
  disabledMcpjsonServers?: string[]
  enableAllProjectMcpServers?: boolean
  [key: string]: unknown
}

interface McpJson {
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>
}

export class ConfigReader {
  constructor(private homeDir: string = process.env.HOME!) {}

  readGlobalSettings(): SettingsJson {
    return this.readJson<SettingsJson>(
      path.join(this.homeDir, '.claude', 'settings.json')
    ) ?? {}
  }

  readProjectSettings(projectPath: string): SettingsJson {
    return this.readJson<SettingsJson>(
      path.join(projectPath, '.claude', 'settings.json')
    ) ?? {}
  }

  readLocalSettings(projectPath: string): SettingsJson {
    return this.readJson<SettingsJson>(
      path.join(projectPath, '.claude', 'settings.local.json')
    ) ?? {}
  }

  readMcpServers(scope: 'global' | 'project', basePath: string): McpJson['mcpServers'] {
    const filePath = scope === 'global'
      ? path.join(this.homeDir, '.claude', '.mcp.json')
      : path.join(basePath, '.mcp.json')
    const data = this.readJson<McpJson>(filePath)
    return data?.mcpServers ?? {}
  }

  getEffectivePluginState(pluginKey: string, projectPath?: string): EffectiveState {
    const global = this.readGlobalSettings()
    const globalVal = global.enabledPlugins?.[pluginKey]

    if (!projectPath || projectPath === path.join(this.homeDir, '.claude')) {
      return { enabled: globalVal ?? true, source: 'global' }
    }

    const project = this.readProjectSettings(projectPath)
    const projectVal = project.enabledPlugins?.[pluginKey]

    if (projectVal !== undefined) {
      return {
        enabled: projectVal,
        source: 'project',
        overrides: globalVal !== undefined
          ? { source: 'global', value: globalVal }
          : undefined,
      }
    }

    return { enabled: globalVal ?? true, source: 'global' }
  }

  getEffectiveMcpState(serverName: string, projectPath?: string): {
    enabled: boolean
    overrideByEnableAll: boolean
  } {
    const global = this.readGlobalSettings()

    if (global.enableAllProjectMcpServers) {
      return { enabled: true, overrideByEnableAll: true }
    }

    const disabled = global.disabledMcpjsonServers ?? []
    if (disabled.includes(serverName)) {
      return { enabled: false, overrideByEnableAll: false }
    }

    const enabled = global.enabledMcpjsonServers ?? []
    return { enabled: enabled.includes(serverName), overrideByEnableAll: false }
  }

  private readJson<T>(filePath: string): T | null {
    try {
      if (!fs.existsSync(filePath)) return null
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run server/services/__tests__/ConfigReader.test.ts
```

预期：PASS 4 tests

- [ ] **Step 5: Commit**

```bash
git add server/services/ConfigReader.ts server/services/__tests__/ConfigReader.test.ts
git commit -m "feat: add ConfigReader with multi-layer merge logic"
```

---

## Task 5: ConfigWriter 服务（原子写）

**Files:**
- Create: `server/services/ConfigWriter.ts`
- Create: `server/services/__tests__/ConfigWriter.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// server/services/__tests__/ConfigWriter.test.ts
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run server/services/__tests__/ConfigWriter.test.ts
```

预期：FAIL — `ConfigWriter` not found

- [ ] **Step 3: 实现 ConfigWriter**

```typescript
// server/services/ConfigWriter.ts
import * as fs from 'fs'
import * as path from 'path'

export class ConfigWriter {
  /**
   * 原子写：读取现有 JSON，深度合并 patch，写入 .tmp，rename 为原文件，保留 .bak
   */
  patchJson(filePath: string, patch: Record<string, unknown>): void {
    const dir = path.dirname(filePath)
    const tmpPath = filePath + '.tmp'
    const bakPath = filePath + '.bak'

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // 读取现有内容
    let existing: Record<string, unknown> = {}
    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      } catch {
        existing = {}
      }
    }

    // 深度合并（只合并顶层 key，对象类型的 value 做浅合并）
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

    // 写 tmp
    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8')

    // 备份原文件
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, bakPath)
    }

    // 原子 rename
    fs.renameSync(tmpPath, filePath)
  }

  /**
   * 从数组中添加或移除一个值（用于 enabledMcpjsonServers 等数组字段）
   */
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

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run server/services/__tests__/ConfigWriter.test.ts
```

预期：PASS 3 tests

- [ ] **Step 5: Commit**

```bash
git add server/services/ConfigWriter.ts server/services/__tests__/ConfigWriter.test.ts
git commit -m "feat: add ConfigWriter with atomic write and backup"
```

---

## Task 6: SkillScanner + McpManager + PluginManager 服务

**Files:**
- Create: `server/services/SkillScanner.ts`
- Create: `server/services/McpManager.ts`
- Create: `server/services/PluginManager.ts`
- Create: `server/services/__tests__/McpManager.test.ts`
- Create: `server/services/__tests__/PluginManager.test.ts`

- [ ] **Step 1: 写 McpManager 失败测试**

```typescript
// server/services/__tests__/McpManager.test.ts
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
      if (p.endsWith('.mcp.json')) return JSON.stringify({
        mcpServers: { 'context7': { command: 'uvx', args: ['context7'] } }
      })
      if (p.endsWith('settings.json')) return JSON.stringify({
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
      if (p.endsWith('.mcp.json')) return JSON.stringify({
        mcpServers: { 'server1': { command: 'uvx', args: [] } }
      })
      if (p.endsWith('settings.json')) return JSON.stringify({
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
```

- [ ] **Step 2: 写 PluginManager 失败测试**

```typescript
// server/services/__tests__/PluginManager.test.ts
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
      if (p.endsWith('installed_plugins.json')) return JSON.stringify({
        'pluginA@market': [{ scope: 'user', installPath: '/path/a', version: '1.0' }]
      })
      if (p.includes('projects') || p.endsWith('blocklist.json')) return JSON.stringify({})
      if (p.includes(PROJECT) && p.endsWith('settings.json')) return JSON.stringify({
        enabledPlugins: { 'pluginA@market': false }
      })
      if (p.endsWith('settings.json')) return JSON.stringify({
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
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
npx vitest run server/services/__tests__/McpManager.test.ts server/services/__tests__/PluginManager.test.ts
```

预期：FAIL — services not found

- [ ] **Step 4: 实现 SkillScanner**

```typescript
// server/services/SkillScanner.ts
import * as fs from 'fs'
import * as path from 'path'
import { Skill } from '../types'

export class SkillScanner {
  constructor(private homeDir: string = process.env.HOME!) {}

  scanGlobal(): Skill[] {
    const skillsDir = path.join(this.homeDir, '.claude', 'skills')
    return this.scanDir(skillsDir, 'global')
  }

  scanProject(projectPath: string): Skill[] {
    const skillsDir = path.join(projectPath, '.claude', 'skills')
    return this.scanDir(skillsDir, 'project')
  }

  private scanDir(skillsDir: string, scope: 'global' | 'project'): Skill[] {
    if (!fs.existsSync(skillsDir)) return []
    const skills: Skill[] = []

    for (const entry of fs.readdirSync(skillsDir)) {
      const fullPath = path.join(skillsDir, entry)
      try {
        const lstat = fs.lstatSync(fullPath)
        const isSymlink = lstat.isSymbolicLink()
        let symlinkTarget: string | undefined
        let resolvedPath = fullPath

        if (isSymlink) {
          symlinkTarget = fs.readlinkSync(fullPath)
          try {
            resolvedPath = fs.realpathSync(fullPath)
          } catch {
            // broken symlink — still include it
          }
        }

        if (!lstat.isDirectory() && !isSymlink) continue

        const skillMdPath = path.join(resolvedPath, 'SKILL.md')
        let description = ''
        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const match = content.match(/^description:\s*(.+)$/m)
          if (match) description = match[1].trim()
        }

        skills.push({
          name: entry,
          description,
          scope,
          path: fullPath,
          isSymlink,
          symlinkTarget,
        })
      } catch {
        // skip unreadable entries
      }
    }

    return skills
  }
}
```

- [ ] **Step 5: 实现 McpManager**

```typescript
// server/services/McpManager.ts
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
        command: def.command,
        args: def.args,
        env: def.env,
        definedIn: scope,
        effective: { enabled, source: 'global' },
        overrideByEnableAll,
      })
    }

    return results
  }

  setEnabled(serverName: string, enabled: boolean): void {
    const settingsPath = path.join(this.homeDir, '.claude', 'settings.json')
    if (enabled) {
      this.writer.patchArrayField(settingsPath, 'enabledMcpjsonServers', serverName, 'add')
      this.writer.patchArrayField(settingsPath, 'disabledMcpjsonServers', serverName, 'remove')
    } else {
      this.writer.patchArrayField(settingsPath, 'enabledMcpjsonServers', serverName, 'remove')
      this.writer.patchArrayField(settingsPath, 'disabledMcpjsonServers', serverName, 'add')
    }
  }

  delete(serverName: string): void {
    const mcpPath = path.join(this.homeDir, '.claude', '.mcp.json')
    const existing = this.reader.readMcpServers('global', this.homeDir)
    const { [serverName]: _removed, ...rest } = existing
    this.writer.patchJson(mcpPath, { mcpServers: rest })
  }
}
```

- [ ] **Step 6: 实现 PluginManager**

```typescript
// server/services/PluginManager.ts
import * as fs from 'fs'
import * as path from 'path'
import { Plugin } from '../types'
import { ConfigReader } from './ConfigReader'
import { ConfigWriter } from './ConfigWriter'

interface InstalledPlugin {
  scope: 'user' | 'project' | 'local'
  installPath: string
  version: string
  projectPath?: string
  gitCommitSha?: string
}

interface Blocklist {
  [key: string]: { reason?: string; timestamp?: string }
}

export class PluginManager {
  private reader: ConfigReader
  private writer: ConfigWriter

  constructor(private homeDir: string = process.env.HOME!) {
    this.reader = new ConfigReader(homeDir)
    this.writer = new ConfigWriter()
  }

  list(projectPath?: string): Plugin[] {
    const registryPath = path.join(this.homeDir, '.claude', 'plugins', 'installed_plugins.json')
    const blocklistPath = path.join(this.homeDir, '.claude', 'plugins', 'blocklist.json')

    let registry: Record<string, InstalledPlugin[]> = {}
    let blocklist: Blocklist = {}

    try {
      if (fs.existsSync(registryPath)) {
        registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
      }
      if (fs.existsSync(blocklistPath)) {
        blocklist = JSON.parse(fs.readFileSync(blocklistPath, 'utf-8'))
      }
    } catch {
      return []
    }

    const plugins: Plugin[] = []

    for (const [key, entries] of Object.entries(registry)) {
      // 取第一条记录作为代表（同一 key 可能有多条 scope 记录）
      const entry = entries[0]
      if (!entry) continue

      const [name, marketplace] = key.split('@')
      const effective = this.reader.getEffectivePluginState(key, projectPath)
      const blocklisted = key in blocklist

      plugins.push({
        key,
        name: name || key,
        marketplace: marketplace || 'unknown',
        version: entry.version,
        scope: entry.scope,
        installPath: entry.installPath,
        projectPath: entry.projectPath,
        effective,
        blocklisted,
        blocklistReason: blocklist[key]?.reason,
      })
    }

    return plugins
  }

  setEnabled(pluginKey: string, enabled: boolean, projectPath?: string): void {
    const isGlobal = !projectPath || projectPath === path.join(this.homeDir, '.claude')
    const settingsPath = isGlobal
      ? path.join(this.homeDir, '.claude', 'settings.json')
      : path.join(projectPath, '.claude', 'settings.json')

    this.writer.patchJson(settingsPath, {
      enabledPlugins: { [pluginKey]: enabled },
    })
  }

  delete(pluginKey: string): void {
    const registryPath = path.join(this.homeDir, '.claude', 'plugins', 'installed_plugins.json')
    if (!fs.existsSync(registryPath)) return

    const registry: Record<string, InstalledPlugin[]> = JSON.parse(
      fs.readFileSync(registryPath, 'utf-8')
    )
    const { [pluginKey]: _removed, ...rest } = registry
    this.writer.patchJson(registryPath, rest)
  }
}
```

- [ ] **Step 7: 运行所有测试，确认通过**

```bash
npx vitest run server/services/__tests__/
```

预期：PASS 全部测试

- [ ] **Step 8: Commit**

```bash
git add server/services/SkillScanner.ts server/services/McpManager.ts server/services/PluginManager.ts server/services/__tests__/McpManager.test.ts server/services/__tests__/PluginManager.test.ts
git commit -m "feat: add SkillScanner, McpManager, PluginManager services"
```

---

## Task 7: Express 路由层

**Files:**
- Create: `server/routes/workspaces.ts`
- Create: `server/routes/skills.ts`
- Create: `server/routes/mcps.ts`
- Create: `server/routes/plugins.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 实现 workspaces 路由**

```typescript
// server/routes/workspaces.ts
import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'

const router = Router()
const scanner = new WorkspaceScanner()

router.get('/', (_req, res) => {
  try {
    const workspaces = scanner.scan()
    res.json(workspaces)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
```

- [ ] **Step 2: 实现 skills 路由**

```typescript
// server/routes/skills.ts
import { Router } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { SkillScanner } from '../services/SkillScanner'

const router = Router()
const HOME = process.env.HOME!

router.get('/:workspaceId/skills', (req, res) => {
  try {
    const { workspaceId } = req.params
    const skillScanner = new SkillScanner(HOME)

    if (workspaceId === 'global') {
      return res.json(skillScanner.scanGlobal())
    }

    const scanner = new WorkspaceScanner(HOME)
    const workspaces = scanner.scan()
    const ws = workspaces.find(w => w.id === workspaceId)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    const globalSkills = skillScanner.scanGlobal()
    const projectSkills = skillScanner.scanProject(ws.path)
    res.json([...globalSkills, ...projectSkills])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/skills/:skillName', (req, res) => {
  try {
    const { workspaceId, skillName } = req.params
    const { scope } = req.query as { scope?: string }
    const skillScanner = new SkillScanner(HOME)

    let skillPath: string
    if (scope === 'global' || workspaceId === 'global') {
      const skills = skillScanner.scanGlobal()
      const skill = skills.find(s => s.name === skillName)
      if (!skill) return res.status(404).json({ error: 'Skill not found' })
      skillPath = skill.path
    } else {
      const scanner = new WorkspaceScanner(HOME)
      const workspaces = scanner.scan()
      const ws = workspaces.find(w => w.id === workspaceId)
      if (!ws) return res.status(404).json({ error: 'Workspace not found' })
      const skills = skillScanner.scanProject(ws.path)
      const skill = skills.find(s => s.name === skillName)
      if (!skill) return res.status(404).json({ error: 'Skill not found' })
      skillPath = skill.path
    }

    // 如果是 symlink，只删 symlink 本身，不删目标
    const lstat = fs.lstatSync(skillPath)
    if (lstat.isSymbolicLink()) {
      fs.unlinkSync(skillPath)
    } else {
      fs.rmSync(skillPath, { recursive: true })
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
```

- [ ] **Step 3: 实现 mcps 路由**

```typescript
// server/routes/mcps.ts
import { Router } from 'express'
import { McpManager } from '../services/McpManager'

const router = Router()
const HOME = process.env.HOME!

router.get('/:workspaceId/mcps', (req, res) => {
  try {
    const mgr = new McpManager(HOME)
    const servers = mgr.list('global', HOME)
    res.json(servers)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.patch('/:workspaceId/mcps/:serverName', (req, res) => {
  try {
    const { serverName } = req.params
    const { enabled } = req.body as { enabled: boolean }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '`enabled` must be boolean' })
    }
    const mgr = new McpManager(HOME)
    mgr.setEnabled(serverName, enabled)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/mcps/:serverName', (req, res) => {
  try {
    const { serverName } = req.params
    const mgr = new McpManager(HOME)
    mgr.delete(serverName)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
```

- [ ] **Step 4: 实现 plugins 路由**

```typescript
// server/routes/plugins.ts
import { Router } from 'express'
import { WorkspaceScanner } from '../services/WorkspaceScanner'
import { PluginManager } from '../services/PluginManager'

const router = Router()
const HOME = process.env.HOME!

router.get('/:workspaceId/plugins', (req, res) => {
  try {
    const { workspaceId } = req.params
    const mgr = new PluginManager(HOME)

    if (workspaceId === 'global') {
      return res.json(mgr.list())
    }

    const scanner = new WorkspaceScanner(HOME)
    const workspaces = scanner.scan()
    const ws = workspaces.find(w => w.id === workspaceId)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    res.json(mgr.list(ws.path))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.patch('/:workspaceId/plugins/:pluginKey', (req, res) => {
  try {
    const { workspaceId, pluginKey } = req.params
    const { enabled } = req.body as { enabled: boolean }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '`enabled` must be boolean' })
    }

    const mgr = new PluginManager(HOME)
    if (workspaceId === 'global') {
      mgr.setEnabled(pluginKey, enabled)
    } else {
      const scanner = new WorkspaceScanner(HOME)
      const workspaces = scanner.scan()
      const ws = workspaces.find(w => w.id === workspaceId)
      if (!ws) return res.status(404).json({ error: 'Workspace not found' })
      mgr.setEnabled(pluginKey, enabled, ws.path)
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.delete('/:workspaceId/plugins/:pluginKey', (req, res) => {
  try {
    const { pluginKey } = req.params
    const mgr = new PluginManager(HOME)
    mgr.delete(decodeURIComponent(pluginKey))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
```

- [ ] **Step 5: 更新 server/index.ts 注册路由**

```typescript
// server/index.ts
import express from 'express'
import cors from 'cors'
import workspacesRouter from './routes/workspaces'
import skillsRouter from './routes/skills'
import mcpsRouter from './routes/mcps'
import pluginsRouter from './routes/plugins'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/workspaces', workspacesRouter)
app.use('/api/workspaces', skillsRouter)
app.use('/api/workspaces', mcpsRouter)
app.use('/api/workspaces', pluginsRouter)

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001')
})
```

- [ ] **Step 6: 验证服务器启动并响应**

```bash
npm run server:dev &
sleep 2
curl http://localhost:3001/api/health
curl http://localhost:3001/api/workspaces
```

预期：`{"ok":true}` 和工作空间列表 JSON

- [ ] **Step 7: Commit**

```bash
git add server/routes/ server/index.ts
git commit -m "feat: add Express API routes for workspaces, skills, mcps, plugins"
```

---

## Task 8: React 前端 - API 层和基础组件

**Files:**
- Create: `client/src/api.ts`
- Create: `client/src/components/WorkspaceSidebar.tsx`
- Create: `client/src/components/TabBar.tsx`
- Create: `client/src/components/ScopeLabel.tsx`
- Create: `client/src/components/ItemCard.tsx`

- [ ] **Step 1: 写 client/src/api.ts**

```typescript
// client/src/api.ts
import type { Workspace, Skill, McpServer, Plugin } from '../../server/types'

const BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  getWorkspaces: () => request<Workspace[]>('/workspaces'),

  getSkills: (workspaceId: string) =>
    request<Skill[]>(`/workspaces/${workspaceId}/skills`),

  deleteSkill: (workspaceId: string, skillName: string, scope: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/skills/${skillName}?scope=${scope}`, {
      method: 'DELETE',
    }),

  getMcps: (workspaceId: string) =>
    request<McpServer[]>(`/workspaces/${workspaceId}/mcps`),

  setMcpEnabled: (workspaceId: string, serverName: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/mcps/${serverName}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  deleteMcp: (workspaceId: string, serverName: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/mcps/${serverName}`, {
      method: 'DELETE',
    }),

  getPlugins: (workspaceId: string) =>
    request<Plugin[]>(`/workspaces/${workspaceId}/plugins`),

  setPluginEnabled: (workspaceId: string, pluginKey: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/plugins/${encodeURIComponent(pluginKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  deletePlugin: (workspaceId: string, pluginKey: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/plugins/${encodeURIComponent(pluginKey)}`, {
      method: 'DELETE',
    }),
}
```

- [ ] **Step 2: 写 ScopeLabel 组件**

```tsx
// client/src/components/ScopeLabel.tsx
import type { EffectiveState } from '../../../server/types'

interface Props {
  effective: EffectiveState
}

const sourceLabel: Record<string, string> = {
  global: '全局',
  project: '项目级',
  local: '本地',
  blocklist: '黑名单',
}

export function ScopeLabel({ effective }: Props) {
  const label = sourceLabel[effective.source] ?? effective.source

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`px-1.5 py-0.5 rounded font-medium ${
        effective.enabled
          ? 'bg-green-100 text-green-700'
          : 'bg-red-100 text-red-700'
      }`}>
        {effective.enabled ? '启用' : '禁用'}
      </span>
      <span className="text-gray-400">via {label}</span>
      {effective.overrides && (
        <span className="text-gray-400 text-xs">
          （覆盖{sourceLabel[effective.overrides.source]}
          {effective.overrides.value ? '启用' : '禁用'}）
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 3: 写 ItemCard 组件**

```tsx
// client/src/components/ItemCard.tsx
import type { EffectiveState } from '../../../server/types'
import { ScopeLabel } from './ScopeLabel'

interface Props {
  name: string
  description?: string
  effective?: EffectiveState
  badge?: string          // 额外标注，如 "symlink"、"blocklisted"
  onToggle?: (enabled: boolean) => void
  onDelete?: () => void
  disabled?: boolean      // 禁止操作（如 enableAllProjectMcpServers=true 时）
  disabledReason?: string
}

export function ItemCard({
  name, description, effective, badge,
  onToggle, onDelete, disabled, disabledReason,
}: Props) {
  return (
    <div className="flex items-start justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-medium text-gray-900 truncate">{name}</span>
          {badge && (
            <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{description}</p>
        )}
        {effective && (
          <div className="mt-1">
            <ScopeLabel effective={effective} />
          </div>
        )}
        {disabled && disabledReason && (
          <p className="text-xs text-amber-600 mt-0.5">{disabledReason}</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        {onToggle && effective && (
          <button
            onClick={() => onToggle(!effective.enabled)}
            disabled={disabled}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              effective.enabled ? 'bg-green-500' : 'bg-gray-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              effective.enabled ? 'translate-x-4' : 'translate-x-1'
            }`} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded"
            title="删除"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 写 TabBar 组件**

```tsx
// client/src/components/TabBar.tsx
export type TabId = 'skills' | 'mcps' | 'plugins'

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
  counts?: { skills?: number; mcps?: number; plugins?: number }
}

const tabs: { id: TabId; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'mcps', label: 'MCP Servers' },
  { id: 'plugins', label: 'Plugins' },
]

export function TabBar({ active, onChange, counts }: Props) {
  return (
    <div className="flex border-b border-gray-200">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            active === tab.id
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
          {counts?.[tab.id] !== undefined && (
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {counts[tab.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: 写 WorkspaceSidebar 组件**

```tsx
// client/src/components/WorkspaceSidebar.tsx
import type { Workspace } from '../../../server/types'

interface Props {
  workspaces: Workspace[]
  selected: string | null
  onSelect: (id: string) => void
  loading: boolean
}

export function WorkspaceSidebar({ workspaces, selected, onSelect, loading }: Props) {
  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          工作空间
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <p className="text-xs text-gray-400 px-3 py-2">加载中...</p>
        )}
        {workspaces.map(ws => (
          <button
            key={ws.id}
            onClick={() => onSelect(ws.id)}
            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
              selected === ws.id
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            } ${!ws.exists ? 'opacity-50' : ''}`}
          >
            <div className="truncate">{ws.name}</div>
            {ws.isGlobal && (
              <div className="text-xs text-gray-400">全局配置</div>
            )}
            {!ws.exists && (
              <div className="text-xs text-red-400">目录已删除</div>
            )}
          </button>
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/
git commit -m "feat: add React API layer and base components"
```

---

## Task 9: React 主页面与完整集成

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/main.tsx`
- Create: `client/src/index.css`

- [ ] **Step 1: 写 client/src/index.css（Tailwind 入口）**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: 写完整 App.tsx**

```tsx
// client/src/App.tsx
import { useState, useEffect, useCallback } from 'react'
import type { Workspace, Skill, McpServer, Plugin } from '../../server/types'
import { api } from './api'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { TabBar, type TabId } from './components/TabBar'
import { ItemCard } from './components/ItemCard'

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('skills')
  const [skills, setSkills] = useState<Skill[]>([])
  const [mcps, setMcps] = useState<McpServer[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 加载工作空间列表
  useEffect(() => {
    api.getWorkspaces().then(ws => {
      setWorkspaces(ws)
      if (ws.length > 0) setSelectedId(ws[0].id)
    }).catch(e => setError(String(e)))
  }, [])

  // 加载当前 tab 数据
  const loadTabData = useCallback(async (wsId: string, tab: TabId) => {
    setLoading(true)
    setError(null)
    try {
      if (tab === 'skills') setSkills(await api.getSkills(wsId))
      if (tab === 'mcps') setMcps(await api.getMcps(wsId))
      if (tab === 'plugins') setPlugins(await api.getPlugins(wsId))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadTabData(selectedId, activeTab)
  }, [selectedId, activeTab, loadTabData])

  const confirmDelete = (name: string, action: () => Promise<unknown>) => {
    if (!confirm(`确认删除 "${name}"？此操作不可撤销。`)) return
    action().then(() => selectedId && loadTabData(selectedId, activeTab))
      .catch(e => setError(String(e)))
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-sm">
      <WorkspaceSidebar
        workspaces={workspaces}
        selected={selectedId}
        onSelect={id => { setSelectedId(id); setActiveTab('skills') }}
        loading={workspaces.length === 0}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="px-6 py-3 border-b border-gray-200 bg-white">
          <h1 className="text-base font-semibold text-gray-900">
            CC Workspace Manager
          </h1>
          {selectedId && (
            <p className="text-xs text-gray-500 mt-0.5">
              {workspaces.find(w => w.id === selectedId)?.path}
            </p>
          )}
        </header>

        {/* Tab 栏 */}
        <div className="px-6 bg-white border-b border-gray-200">
          <TabBar
            active={activeTab}
            onChange={setActiveTab}
            counts={{
              skills: skills.length,
              mcps: mcps.length,
              plugins: plugins.length,
            }}
          />
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {error}
            </div>
          )}

          {loading && (
            <div className="text-gray-400 text-xs">加载中...</div>
          )}

          {!loading && activeTab === 'skills' && (
            <div className="space-y-2">
              {skills.length === 0 && <p className="text-gray-400 text-xs">暂无 skill</p>}
              {skills.map(skill => (
                <ItemCard
                  key={skill.path}
                  name={skill.name}
                  description={skill.description}
                  badge={skill.isSymlink ? 'symlink' : skill.scope === 'global' ? '全局' : '项目'}
                  onDelete={() => confirmDelete(skill.name, () =>
                    api.deleteSkill(selectedId!, skill.name, skill.scope)
                  )}
                />
              ))}
            </div>
          )}

          {!loading && activeTab === 'mcps' && (
            <div className="space-y-2">
              {mcps.length === 0 && <p className="text-gray-400 text-xs">暂无 MCP server</p>}
              {mcps.map(mcp => (
                <ItemCard
                  key={mcp.name}
                  name={mcp.name}
                  description={`${mcp.command} ${mcp.args.join(' ')}`}
                  effective={mcp.effective}
                  disabled={mcp.overrideByEnableAll}
                  disabledReason={mcp.overrideByEnableAll ? 'enableAllProjectMcpServers=true，所有 server 强制启用' : undefined}
                  onToggle={enabled =>
                    api.setMcpEnabled(selectedId!, mcp.name, enabled)
                      .then(() => loadTabData(selectedId!, 'mcps'))
                      .catch(e => setError(String(e)))
                  }
                  onDelete={() => confirmDelete(mcp.name, () =>
                    api.deleteMcp(selectedId!, mcp.name)
                  )}
                />
              ))}
            </div>
          )}

          {!loading && activeTab === 'plugins' && (
            <div className="space-y-2">
              {plugins.length === 0 && <p className="text-gray-400 text-xs">暂无 plugin</p>}
              {plugins.map(plugin => (
                <ItemCard
                  key={plugin.key}
                  name={plugin.key}
                  description={`v${plugin.version} · ${plugin.scope}`}
                  effective={plugin.effective}
                  badge={plugin.blocklisted ? '已屏蔽' : undefined}
                  onToggle={enabled =>
                    api.setPluginEnabled(selectedId!, plugin.key, enabled)
                      .then(() => loadTabData(selectedId!, 'plugins'))
                      .catch(e => setError(String(e)))
                  }
                  onDelete={() => confirmDelete(plugin.key, () =>
                    api.deletePlugin(selectedId!, plugin.key)
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 3: 更新 client/src/main.tsx**

```tsx
// client/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 4: 配置 Tailwind**

```bash
cd /Users/liuyi85/cc-workspace-manager
npx tailwindcss init -p
```

更新 `tailwind.config.js`：

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/src/**/*.{ts,tsx}', './client/index.html'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 5: 端到端验证**

```bash
npm run dev
```

打开 `http://localhost:3000`，验证：
1. 左侧显示工作空间列表（含 Global 和历史项目）
2. 点击工作空间，右侧显示 Skills / MCPs / Plugins 三个 tab
3. MCP tab 显示 toggle 开关，状态与 `~/.claude/settings.json` 一致
4. Plugin tab 显示启用/禁用状态，项目级覆盖有标注
5. 删除操作弹出确认框

- [ ] **Step 6: 运行全部测试**

```bash
npm test
```

预期：全部 PASS

- [ ] **Step 7: 最终 Commit**

```bash
git add .
git commit -m "feat: complete React frontend with workspace manager UI"
```

---

## 完成验收标准

1. `npm run dev` 一键启动，无报错
2. 工作空间列表正确显示 `~/.claude/projects/` 中的所有历史项目
3. Plugin 的项目级覆盖状态正确显示（如 `superpowers@claude-plugins-official` 在 `incentive-claude` 项目中显示"项目级：禁用（覆盖全局启用）"）
4. MCP toggle 操作后，`~/.claude/settings.json` 中的 `enabledMcpjsonServers` 数组正确更新，且其他字段（`env.ANTHROPIC_AUTH_TOKEN` 等）保持不变
5. 删除 symlink skill 只删除 symlink 本身，不删除目标文件
6. 全部单元测试通过

