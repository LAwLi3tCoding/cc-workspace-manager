# CC Workspace Manager

本地可视化工具，用于管理所有 Claude Code 工作空间中的 Skill、MCP Server、Plugin 和 Hook。

## 安装

### 方式一：一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/LAwLi3tCoding/cc-workspace-manager/master/install.sh | bash
```

### 方式二：下载安装包

1. 前往 [Releases](https://github.com/LAwLi3tCoding/cc-workspace-manager/releases) 下载最新的 `cc-workspace-manager-release.tar.gz`
2. 解压并运行安装脚本：

```bash
tar -xzf cc-workspace-manager-release.tar.gz
cd cc-workspace-manager
bash install.sh
```

**要求**：macOS，Node.js 18+

安装完成后服务自动启动，开机也会自动启动，无需手动操作。

---

## 访问

```
http://localhost:47890
```

---

## 功能

### 工作空间列表（左侧边栏）
- 自动扫描 `~/.claude/projects/` 中所有历史工作空间
- 标注"全局配置"（`~/.claude/`）和"目录已删除"的悬空工作空间
- 点击切换工作空间，右侧内容实时更新

### Skills Tab
- 展示全局（`~/.claude/skills/`）和项目级（`<project>/.claude/skills/`）的所有 skill
- Symlink 类型的 skill 有 `symlink` 标注
- 删除操作：symlink 只删除链接本身，不影响目标文件

### MCP Servers Tab
- 展示 `~/.claude/.mcp.json` 中定义的所有 MCP server
- Toggle 开关控制启用/禁用（写入 `settings.json` 的 `enabledMcpjsonServers`）
- 当 `enableAllProjectMcpServers=true` 时，所有 server 强制启用，toggle 不可操作并显示提示
- 删除操作从 `.mcp.json` 中移除 server 定义

### Plugins Tab
- 展示 `~/.claude/plugins/installed_plugins.json` 中所有已安装 plugin
- 显示实际生效状态，标注被哪层配置覆盖（如"项目级：禁用（覆盖全局启用）"）
- Toggle 开关按当前工作空间层级写入对应 `settings.json`
- 已屏蔽（blocklist）的 plugin 有"已屏蔽"标注

### Hooks Tab
- 展示全局和项目级的所有 hook 脚本
- 支持删除 hook 文件

---

## 安全机制

所有写操作均采用**原子写**策略：

1. 读取现有配置文件
2. 深度合并（不覆盖其他字段，如 `env.ANTHROPIC_AUTH_TOKEN`）
3. 写入临时文件（`.tmp`）
4. 备份原文件（`.bak`）
5. 原子 rename `.tmp` → 原文件

---

## 服务管理

```bash
# 停止服务
launchctl unload ~/Library/LaunchAgents/com.ccworkspace.manager.plist

# 启动服务
launchctl load ~/Library/LaunchAgents/com.ccworkspace.manager.plist

# 查看运行日志
tail -f ~/cc-workspace-manager/.omc/logs/server.log
tail -f ~/cc-workspace-manager/.omc/logs/server.error.log
```

### 更新到新版本

```bash
curl -fsSL https://raw.githubusercontent.com/LAwLi3tCoding/cc-workspace-manager/master/install.sh | bash
```

重新运行安装脚本即可，会自动停止旧服务、安装新版本并重启。

---

## 开发模式

开发时使用热重载（前后端分离）：

```bash
cd ~/cc-workspace-manager
npm run dev
```

- 前端：`http://localhost:3000`（Vite 热重载，代理 API 到后端）
- 后端：`http://localhost:47890`（nodemon 热重载）

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js 18+, TypeScript, Express |
| 前端 | React 18, Vite, TailwindCSS |
| 测试 | Vitest |
| 部署 | macOS launchd（开机自启） |

---

## 项目结构

```
cc-workspace-manager/
├── server/
│   ├── index.ts               # Express 入口（port 47890）
│   ├── types.ts               # 共享 TypeScript 类型
│   ├── services/
│   │   ├── WorkspaceScanner   # 扫描工作空间
│   │   ├── ConfigReader       # 多层配置合并
│   │   ├── ConfigWriter       # 原子写
│   │   ├── SkillScanner       # 扫描 skill 目录
│   │   ├── McpManager         # MCP server 管理
│   │   ├── PluginManager      # Plugin 管理
│   │   └── HooksScanner       # Hook 扫描
│   └── routes/                # REST API 路由
├── client/
│   └── src/
│       ├── App.tsx            # 主页面
│       ├── api.ts             # API 调用封装
│       └── components/        # UI 组件
├── dist/                      # 构建产物（生产模式）
├── install.sh                 # 一键安装脚本
└── package-release.sh         # 打包发布脚本
```
