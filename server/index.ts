import express from 'express'
import cors from 'cors'
import * as path from 'path'
import * as fs from 'fs'
import * as https from 'https'
import workspacesRouter from './routes/workspaces'
import skillsRouter from './routes/skills'
import mcpsRouter from './routes/mcps'
import pluginsRouter from './routes/plugins'
import hooksRouter from './routes/hooks'
import eventsRouter, { initFileWatcher } from './routes/events'

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 47890
const GITHUB_REPO = 'LAwLi3tCoding/cc-workspace-manager'

// ── 版本检查 ──────────────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'))
const CURRENT_VERSION: string = pkg.version

interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  checkedAt: number
}

let updateInfo: UpdateInfo = {
  hasUpdate: false,
  currentVersion: CURRENT_VERSION,
  latestVersion: null,
  releaseUrl: null,
  checkedAt: 0,
}

function checkForUpdates() {
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_REPO}/releases/latest`,
    headers: { 'User-Agent': 'cc-workspace-manager' },
  }
  https.get(options, res => {
    let data = ''
    res.on('data', chunk => { data += chunk })
    res.on('end', () => {
      try {
        const release = JSON.parse(data)
        const latest: string = (release.tag_name || '').replace(/^v/, '')
        const current = CURRENT_VERSION.replace(/^v/, '')
        const hasUpdate = latest !== '' && latest !== current
        updateInfo = {
          hasUpdate,
          currentVersion: CURRENT_VERSION,
          latestVersion: latest || null,
          releaseUrl: release.html_url || null,
          checkedAt: Date.now(),
        }
        if (hasUpdate) {
          console.log(`[update] New version available: v${latest} (current: v${current})`)
        }
      } catch { /* ignore parse errors */ }
    })
  }).on('error', () => { /* ignore network errors */ })
}

// 启动时检查，之后每小时检查一次
checkForUpdates()
setInterval(checkForUpdates, 60 * 60 * 1000)

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/update-check', (_req, res) => res.json(updateInfo))
app.use('/api/workspaces', workspacesRouter)
app.use('/api/workspaces', skillsRouter)
app.use('/api/workspaces', mcpsRouter)
app.use('/api/workspaces', pluginsRouter)
app.use('/api/workspaces', hooksRouter)
app.use('/api/events', eventsRouter)

// 启动文件监听（生产和开发模式均启动）
initFileWatcher()

// Serve 前端静态文件（生产模式）
const distDir = path.join(__dirname, '..', 'client')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback：所有非 /api 路由都返回 index.html
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`CC Workspace Manager running on http://localhost:${PORT}`)
})
