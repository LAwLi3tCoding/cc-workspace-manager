import * as fs from 'fs'
import * as path from 'path'
import { Workspace } from '../types'

export class WorkspaceScanner {
  constructor(private homeDir: string = process.env.HOME || '/Users/' + process.env.USER) {}

  scan(): Workspace[] {
    const workspaces: Workspace[] = []

    workspaces.push({
      id: 'global',
      path: path.join(this.homeDir, '.claude'),
      name: 'Global (~/.claude)',
      isGlobal: true,
      exists: true,
    })

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
      workspaces.push({
        id: slug,
        path: decoded,
        name: path.basename(decoded),
        isGlobal: false,
        exists: fs.existsSync(decoded),
      })
    }

    return workspaces
  }

  private decodeSlug(slug: string): string | null {
    if (!slug.startsWith('-')) return null
    // Slugs encode '/' as '-', making decoding ambiguous when directory names
    // contain hyphens. We resolve ambiguity by trying all candidate paths via
    // recursive backtracking and returning the first existing one.
    const tokens = slug.slice(1).split('-') // strip leading '-', then split
    const result = this.trySegments(tokens, 0, [])
    if (result) return '/' + result.join('/')
    // fallback: treat every '-' as '/'
    return '/' + tokens.join('/')
  }

  // Recursively try grouping tokens into path segments (each segment is
  // one or more tokens joined by '-'), checking existence at each full path.
  private trySegments(tokens: string[], idx: number, segments: string[]): string[] | null {
    if (idx === tokens.length) {
      if (segments.length === 0) return null
      const candidate = '/' + segments.join('/')
      return fs.existsSync(candidate) ? segments : null
    }
    // Try extending the current segment (hyphen within dir name)
    if (segments.length > 0) {
      const withHyphen = [...segments.slice(0, -1), segments[segments.length - 1] + '-' + tokens[idx]]
      const found = this.trySegments(tokens, idx + 1, withHyphen)
      if (found) return found
    }
    // Try starting a new segment
    const withSlash = [...segments, tokens[idx]]
    return this.trySegments(tokens, idx + 1, withSlash)
  }
}
