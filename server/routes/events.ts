import { Router, Request, Response } from 'express'
import { FileWatcher } from '../services/FileWatcher'

const router = Router()
const HOME = process.env.HOME!

let watcher: FileWatcher | null = null
const clients = new Set<Response>()

export function initFileWatcher(): void {
  if (watcher) { watcher.stop(); watcher = null }
  watcher = new FileWatcher(HOME)
  watcher.onChange((workspaceId) => {
    const data = JSON.stringify({ type: 'workspace-changed', workspaceId })
    for (const client of clients) {
      try {
        client.write(`data: ${data}\n\n`)
      } catch {
        clients.delete(client)
      }
    }
  })
  watcher.start()
}

router.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  res.write(': connected\n\n')
  clients.add(res)

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      clearInterval(heartbeat)
      clients.delete(res)
    }
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(res)
  })
})

export default router
