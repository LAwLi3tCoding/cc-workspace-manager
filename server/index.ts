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
