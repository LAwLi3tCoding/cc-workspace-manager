# cc-workspace-manager 功能增强设计文档

**日期**: 2026-04-10  
**版本**: v1.3.2 → v2.0.0  
**方案**: A（渐进式增强）

---

## 背景与目标

cc-workspace-manager 是一个管理 Claude Code 多工作空间配置的 Web UI 工具。
当前版本存在若干 bug、功能缺口和体验问题，本文档描述按优先级分批实现的完整增强方案。

---

## 第一部分：Bug 修复

### 1.1 MCP workspaceId 被忽略（正确性 Bug）

**问题**: `server/routes/mcps.ts` 接收 `workspaceId` 参数但硬编码读写全局
`~/.claude/settings.json`，导致在项目工作空间里切换 MCP 开关实际修改的是全局配置。

**方案**:
- `McpManager.list(scope, basePath)` 已有参数，但路由层未传入正确值
- 路由层从 `WorkspaceScanner` 查找 `workspaceId` 对应的实际路径
- 区分 scope：`global` 写 `~/.claude/settings.json`，`project` 写 `<workspace>/.claude/.mcp.json`
- 客户端 `api.ts` 所有 MCP 请求携带当前选中的 `workspaceId`

**影响文件**: `server/routes/mcps.ts`, `server/services/McpManager.ts`, `client/src/api.ts`

### 1.2 ConfigWriter 并发写入竞态

**问题**: 多个并发请求同时修改同一配置文件时，后写入覆盖前写入（read-modify-write 竞态）。

**方案**:
- 引入 per-file 的 Promise 串行队列（手写，无需额外依赖）
- `ConfigWriter` 内部维护 `Map<filePath, Promise>` 队列
- 每次写操作 enqueue 到对应文件的队列末尾，前一个完成后才执行下一个

**影响文件**: `server/services/ConfigWriter.ts`

---

## 第二部分：实时同步（SSE + chokidar）

### 2.1 架构

```
[文件系统变化]
    ↓ chokidar 监听
[FileWatcher Service]
    ↓ 触发事件
[SSE 端点 GET /api/events]
    ↓ 推送
[前端 EventSource]
    ↓ 自动刷新对应 workspace 数据
[UI 更新]
```

### 2.2 服务端

- 新增 `server/services/FileWatcher.ts`：封装 chokidar，监听 `~/.claude` 及各项目 `.claude` 目录
- 新增 `GET /api/events` SSE 端点，维护连接池，文件变化时推送：
  ```json
  { "type": "workspace-changed", "workspaceId": "global" }
  { "type": "workspace-changed", "workspaceId": "proj-xxx" }
  ```
- chokidar 依赖：`npm install chokidar`

### 2.3 客户端

- `App.tsx` 新增 `useEffect` 订阅 SSE
- 收到 `workspace-changed` 事件时，若 `workspaceId` 匹配当前选中，自动调用 `loadTabData`
- 保留手动 Refresh 按钮（网络异常时兜底）
- SSE 断线自动重连（`EventSource` 原生支持）

**新增依赖**: `chokidar@^3`

---

## 第三部分：UI 体验优化

### 3.1 工作空间侧边栏搜索

- `WorkspaceSidebar` 顶部新增搜索输入框
- 实时过滤（keyup 无延迟），匹配工作空间名称和路径
- 清空输入框恢复完整列表
- 无搜索结果时显示"未找到匹配的工作空间"提示

**影响文件**: `client/src/components/WorkspaceSidebar.tsx`

### 3.2 Skill symlink 路径展示

- `ItemCard` 中若 `symlinkTarget` 存在，在 badge 下方展示目标路径
- 若 symlink 目标路径不存在（断链），以红色警告样式标注"断链"
- 服务端 `SkillScanner` 增加 `symlinkBroken: boolean` 字段检测

**影响文件**: `client/src/components/ItemCard.tsx`, `server/services/SkillScanner.ts`, `server/types.ts`

### 3.3 错误信息友好化

- 客户端统一解析 server 返回的 `{ error: string }` 格式
- 不再直接 `String(err)` 暴露原始 stack
- 错误提示使用人类可读的中文描述

**影响文件**: `client/src/App.tsx`, `client/src/api.ts`

### 3.4 刷新粒度优化

- Refresh 按钮只刷新当前 Tab 数据，不全量加载所有 Tab
- 切换 workspace 时仍全量加载（正确行为）

**影响文件**: `client/src/App.tsx`

---

## 第四部分：功能扩展

### 4.1 MCP 创建（stdio + SSE 两种类型）

**UI**:
- MCP Tab 右上角新增"+ 添加 MCP"按钮
- 弹出 Modal 表单，字段：
  - 名称（必填，唯一）
  - 类型：`stdio` / `sse`（单选）
  - stdio：命令（必填）+ 参数列表（可选）+ 环境变量（key-value 列表）
  - sse：URL（必填）+ 环境变量（可选）
  - Scope：global / project（当前工作空间）
- 提交后关闭 Modal，列表立即更新

**服务端**:
- 新增 `POST /:workspaceId/mcps` 路由
- `McpManager.create(name, config, scope, basePath)` 方法
- 写入对应 scope 的配置文件（global: `settings.json` mcpServers 字段，project: `.mcp.json`）

**影响文件**: `server/routes/mcps.ts`, `server/services/McpManager.ts`, `client/src/App.tsx`（新增 Modal 组件）

### 4.2 Hook 创建

**UI**:
- Hooks Tab 右上角新增"+ 添加 Hook"按钮
- 弹出 Modal 表单，字段：
  - 事件类型（下拉选择：PreToolUse / PostToolUse / Stop / Notification 等）
  - 匹配器（tool name 或 `*`）
  - 命令（必填）
  - Scope：global / project
- 写入 `settings.json` 的 `hooks` 字段（JSON 格式）

**服务端**:
- 新增 `POST /:workspaceId/hooks` 路由
- `HooksScanner` 增加 `create` 方法，写入 settings.json hooks 字段

**影响文件**: `server/routes/hooks.ts`, `server/services/HooksScanner.ts`, `client/src/App.tsx`

### 4.3 跨工作空间操作

**4.3.1 单项复制（MCP / Plugin）**:
- MCP 和 Plugin 卡片新增"复制到..."按钮（图标按钮，hover 显示）
- 点击弹出工作空间选择器（下拉或 Modal）
- 选择目标工作空间后，将该配置项写入目标工作空间的对应配置文件
- 服务端新增 `POST /api/copy` 路由，参数：`{ type, itemName, sourceWorkspaceId, targetWorkspaceId }`

**4.3.2 全量导出/导入**:
- 工作空间侧边栏每个工作空间条目增加"⋮"菜单，包含：
  - "导出配置 JSON" — 将该工作空间的 MCPs + Plugins 导出为 JSON 文件下载
  - "从 JSON 导入" — 上传 JSON 文件，合并写入该工作空间配置
- 服务端新增 `GET /:workspaceId/export` 和 `POST /:workspaceId/import` 路由

**影响文件**: `server/routes/workspaces.ts`（新增 export/import），新增 `server/routes/copy.ts`，`client/src/components/WorkspaceSidebar.tsx`，`client/src/App.tsx`

---

## 数据流变化总结

```
当前: 前端请求 → 服务端每次全量扫描文件系统 → 返回数据
目标: 前端请求 → 服务端内存缓存（chokidar invalidate）→ 返回数据
      文件变化 → chokidar → SSE 推送 → 前端自动刷新
```

---

## 实现顺序

1. Bug 修复（MCP workspaceId + ConfigWriter 竞态）
2. chokidar + SSE 实时同步
3. UI 体验优化（搜索、symlink、错误、刷新粒度）
4. MCP 创建 + Hook 创建
5. 跨工作空间操作（单项复制 + 导出/导入）

---

## 依赖变更

| 包 | 类型 | 原因 |
|----|------|------|
| `chokidar@^3` | dependencies | 文件系统监听，SSE 实时同步 |

其余均为现有依赖范围内实现，无需新增。

---

## 测试要点

- MCP enable/disable 操作后验证写入的是正确 scope 的配置文件
- 并发写入同一文件不产生数据丢失
- SSE 断线重连后数据保持最新
- 创建 MCP 后列表立即显示新条目且配置文件存在对应 key
- 跨工作空间复制后目标工作空间配置文件包含复制的条目
