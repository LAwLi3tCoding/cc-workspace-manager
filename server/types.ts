export interface Workspace {
  id: string
  path: string
  name: string
  isGlobal: boolean
  exists: boolean
}

export type EffectiveSource = 'global' | 'project' | 'local' | 'blocklist'

export interface EffectiveState {
  enabled: boolean
  source: EffectiveSource
  overrides?: {
    source: EffectiveSource
    value: boolean
  }
}

export interface Skill {
  name: string
  description: string
  scope: 'global' | 'project'
  path: string
  isSymlink: boolean
  symlinkTarget?: string
  symlinkBroken?: boolean
}

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

export interface Plugin {
  key: string
  name: string
  marketplace: string
  version: string
  scope: 'user' | 'project' | 'local'
  installPath: string
  projectPath?: string
  effective: EffectiveState
  blocklisted: boolean
  blocklistReason?: string
}

export interface HookFile {
  filename: string
  scope: 'global' | 'project'
  path: string
  content: string
  sizeBytes: number
}
