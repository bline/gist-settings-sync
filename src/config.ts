import vscode from 'vscode'

import { isCodeServer } from '@/globals'
import * as os from 'os'
import path from 'path'

export type MetaCheckAction = 'ask' | 'sync' | 'cancel'

export interface SyncConfig {
  // The GitHub Gist ID to sync settings to/from.
  gistId: string
  // Cron expression for automatic sync (e.g. '0 * * * *' for every hour). Leave empty to disable.
  cron: string
  // Include user settings in sync.
  includeSettings: boolean
  // Include keyboard shortcuts in sync.
  includeKeybindings: boolean
  // Include user snippets in sync.
  includeSnippets: boolean
  // Include user tasks in sync.
  includeTasks: boolean
  // Include UI state in sync.
  includeUIState: boolean
  // Include profiles in sync.
  includeProfiles: boolean
  // Include list of extensions in sync and auto–install missing ones.
  includeExtensions: boolean
  // Path to the user data directory (e.g. where settings.json is stored). Leave empty for default.
  userDataDir: string
  // The number of minutes between UI syncs in code-server. Code Server stores UI State in IndexedDB
  // in the frontend. This is how often we sync that data to the backend.
  // Only used if `includeUIState` is enabled and on code-server
  uiStateSyncInterval: number
  // What to do when syncing up and the meta information for the current configuration conflicts
  // with what is stored in the Gist.
  syncUpMetaCheckAction: MetaCheckAction
  // What to do when syncing down and the meta information for the current configuration conflicts
  // with what is stored in the Gist.
  syncDownMetaCheckAction: MetaCheckAction
  // The keys that we sync from the UI state (IndexedDB on code-server, sqlite on vscode) into a
  // uiState.json file to be exported to the Gist.
  uiStateSyncKeys: string[]
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
    uiStateSyncInterval: config.get<number>('uiStateSyncInterval', 10),
    syncUpMetaCheckAction: config.get<MetaCheckAction>('syncUpMetaCheckAction', 'ask'),
    syncDownMetaCheckAction: config.get<MetaCheckAction>(
      'syncDownMetaCheckAction',
      'ask',
    ),
    uiStateSyncKeys: config.get<string[]>('uiStateSyncKeys', [])
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
