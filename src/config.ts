import { isCodeServer } from './globals'
import path from 'path'
import * as os from 'os'
import vscode from './vscode'

export interface SyncConfig {
  gistId: string
  cron: string
  includeSettings: boolean
  includeKeybindings: boolean
  includeSnippets: boolean
  includeTasks: boolean
  includeUIState: boolean
  includeProfiles: boolean
  includeExtensions: boolean
  userDataDir: string
  uiStateSyncInterval: number
}


/**
 * Reads the extension configuration.
 */
export function getConfig(): SyncConfig {
  const config = vscode.workspace.getConfiguration('gistSettingsSync')
  return {
    gistId: config.get<string>('gistId', ''),
    cron: config.get<string>('cron', ''),
    includeSettings: config.get<boolean>('includeSettings', true),
    includeKeybindings: config.get<boolean>('includeKeybindings', true),
    includeSnippets: config.get<boolean>('includeSnippets', true),
    includeTasks: config.get<boolean>('includeTasks', true),
    includeUIState: config.get<boolean>('includeUIState', true),
    includeProfiles: config.get<boolean>('includeProfiles', true),
    includeExtensions: config.get<boolean>('includeExtensions', true),
    userDataDir: config.get<string>('userDataDir', ''),
    uiStateSyncInterval: config.get<number>('uiStateSyncInterval', 10)
  }
}

/**
 * Returns the default user data directory (platform–dependent).
 */
export function getDefaultUserDataDir(): string {
  const homeDir: string = os.homedir()
  if (isCodeServer) {
    return path.join(homeDir, '.local', 'share', 'code-server', 'User')
  } else if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Code', 'User')
  } else if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Code', 'User')
  }
  return path.join(homeDir, '.config', 'Code', 'User')
}

/**
 * Returns the user data directory from configuration or the default.
 */
export function getUserDataDir(): string {
  const config: SyncConfig = getConfig()
  if (config.userDataDir && config.userDataDir.trim() !== '') {
    return config.userDataDir
  }
  return getDefaultUserDataDir()
}
