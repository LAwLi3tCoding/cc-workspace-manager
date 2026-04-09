import express from 'express'
import cors from 'cors'
import * as path from 'path'
import * as fs from 'fs'
import workspacesRouter from './routes/workspaces'
import skillsRouter from './routes/skills'
import mcpsRouter from './routes/mcps'
import pluginsRouter from './routes/plugins'
import hooksRouter from './routes/hooks'

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 7890

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/workspaces', workspacesRouter)
app.use('/api/workspaces', skillsRouter)
app.use('/api/workspaces', mcpsRouter)
app.use('/api/workspaces', pluginsRouter)
app.use('/api/workspaces', hooksRouter)

// Serve 前端静态文件（生产模式）
const distDir = path.join(__dirname, '..', 'dist', 'client')
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
