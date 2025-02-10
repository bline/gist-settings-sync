import vscode from 'vscode'

import {SyncConfig, getConfig, getUserDataDir} from '@/config'
import {readFileIfExists, writeFileEnsureDir} from '@/fileUtils'
import {Database, OPEN_READONLY, OPEN_READWRITE} from '@/lib/sqlite3'
import {isNodeError} from '@/nodeUtils'
import {UISync} from '@/uiStateSync/types'
import fs from 'fs/promises'
import path from 'path'
import {URL} from 'url'

/* --------------------------------------------------------------------------
   Logging Helper
-------------------------------------------------------------------------- */
const logger = {
  error: (msg: string, err?: unknown) => console.error(`[UI Sync Error] ${msg}`, err),
  info: (msg: string) => console.info(`[UI Sync Info] ${msg}`),
  warn: (msg: string) => console.warn(`[UI Sync Warn] ${msg}`),
}

/* --------------------------------------------------------------------------
   Generic Database Helper
   Opens a database, executes a callback, and ensures closure.
-------------------------------------------------------------------------- */
async function withDatabase<T>(
  dbPath: string,
  mode: number,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  const db = await Database.open(dbPath, mode)
  try {
    return await fn(db)
  } finally {
    await db.close()
  }
}

/* --------------------------------------------------------------------------
   SQL Query Constants
-------------------------------------------------------------------------- */
const SELECT_TABLE_NAMES_QUERY = `SELECT name as tableName FROM sqlite_master WHERE type='table' ORDER BY name`
const SELECT_KEY_QUERY = (tableName: string) => `SELECT value FROM ${tableName} WHERE key = ?key`
const SELECT_ALL_KEYS_QUERY = (tableName: string) => `SELECT key, value FROM ${tableName}`

/* --------------------------------------------------------------------------
   Types
-------------------------------------------------------------------------- */

/** Mapping of keys to values from a SQLite table. */
interface UIStateData {
  [key: string]: unknown
}

/** Mapping of object store names to UI state data. */
interface WorkspaceData {
  [storeName: string]: UIStateData
}

/** Complete UI state data grouped by workspace name. */
interface ExtractedData {
  [workspace: string]: WorkspaceData
}

/** Result returned when extracting data from a single database. */
interface ExtractDatabaseResult {
  dbPath: string
  data: ExtractedData
}

/* --------------------------------------------------------------------------
   Utility Functions
-------------------------------------------------------------------------- */

/**
 * Extracts the workspace name from a "debug.selectedroot" URL.
 * Expected format: "file:///some/path/{workspaceName}/.vscode/launch.json"
 */
function getWorkspaceName(selectedRoot: string): string | null {
  try {
    const url = new URL(selectedRoot)
    const parts = url.pathname.split('/')
    const vscodeIndex = parts.indexOf('.vscode')
    if (vscodeIndex > 0) {
      return parts[vscodeIndex - 1]
    }
  } catch (_) {
    logger.error('Invalid URL in debug.selectedroot:', selectedRoot)
  }
  return null
}

/**
 * Determines whether a given key is safe to sync.
 * Converts wildcard keys (e.g. "workbench.view.extension.*.state") into a RegExp.
 */
function isSafeKey(key: string, safeKeysToSync: string[]): boolean {
  if (safeKeysToSync.includes(key)) {
    return true
  }
  for (const safe of safeKeysToSync) {
    if (safe.includes('*')) {
      const escaped = safe.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '[^.]*')
      const regex = new RegExp('^' + escaped + '$')
      if (regex.test(key)) {
        return true
      }
    }
  }
  return false
}

/**
 * Retrieves the file paths of SQLite databases that contain UI state.
 */
async function getAllUIStateDatabases(): Promise<string[]> {
  const dbRoot = path.join(getUserDataDir(), 'workspaceStorage')
  const databaseFiles: string[] = []

  try {
    await fs.access(dbRoot)
    const directories = await fs.readdir(dbRoot)
    for (const dir of directories) {
      const databaseFile = path.join(dbRoot, dir, 'state.vscdb')
      try {
        await fs.access(databaseFile)
        databaseFiles.push(databaseFile)
      } catch (error) {
        if (isNodeError(error) && error.code !== 'ENOENT') {
          throw new Error(`Failed to access ${databaseFile}`, {cause: error})
        }
        // Skip if file does not exist.
      }
    }
  } catch (error) {
    logger.error(`Failed to access '${dbRoot}'`, error)
    return []
  }
  return databaseFiles
}

/* --------------------------------------------------------------------------
   Database Extraction & Update Helpers
-------------------------------------------------------------------------- */

/**
 * Extracts UI state data from the specified SQLite database.
 */
async function extractDatabase(dbPath: string): Promise<ExtractDatabaseResult> {
  const config: SyncConfig = getConfig() // Cache config locally.
  const result: ExtractedData = {}

  await withDatabase(dbPath, OPEN_READONLY, async (db) => {
    // Iterate over each table.
    for await (const {tableName} of db.each<{tableName: string}>(SELECT_TABLE_NAMES_QUERY)) {
      let hasSelectedRoot = false
      const safeData: UIStateData = {}

      // Iterate over each row in the table.
      for await (const {key, value} of db.each<{key: string; value: string}>(
        SELECT_ALL_KEYS_QUERY(tableName),
      )) {
        if (!key) continue
        if (key === 'debug.selectedroot' || isSafeKey(key, config.uiStateSyncKeys)) {
          safeData[key] = value
          if (key === 'debug.selectedroot') {
            hasSelectedRoot = true
          }
        }
      }
      if (!hasSelectedRoot) continue

      const selectedRootValue = safeData['debug.selectedroot']
      if (typeof selectedRootValue !== 'string') continue

      const workspaceName = getWorkspaceName(selectedRootValue)
      if (!workspaceName) continue

      if (!result[workspaceName]) {
        result[workspaceName] = {}
      }
      result[workspaceName][tableName] = safeData
    }
  })

  return {dbPath, data: result}
}

/**
 * Helper function that updates a given table with new key/value data within a single transaction.
 */
async function updateTable(
  db: Database,
  dbPath: string,
  tableName: string,
  newTableData: Record<string, unknown>,
): Promise<void> {
  try {
    await db.run(`BEGIN TRANSACTION`)
  } catch (error) {
    logger.error(`Failed to begin transaction for table '${tableName}' in '${dbPath}'`, error)
    return
  }

  try {
    for (const key in newTableData) {
      const value = newTableData[key] as string
      // Check if key exists.
      const hasKey = await db.get<number>(`SELECT 1 FROM ${tableName} WHERE key = ?key`, {key})
      if (hasKey) {
        await db.run(`UPDATE ${tableName} SET value = ?value WHERE key = ?key`, {key, value})
      } else {
        await db.run(`INSERT INTO ${tableName} (key, value) VALUES (?key, ?value)`, {key, value})
      }
    }
    await db.run(`COMMIT`)
  } catch (error) {
    logger.error(`Error updating table '${tableName}' in '${dbPath}', rolling back.`, error)
    try {
      await db.run(`ROLLBACK`)
    } catch (rollbackError) {
      logger.error(
        `Failed to rollback transaction for table '${tableName}' in '${dbPath}'`,
        rollbackError,
      )
    }
  }
}

/* --------------------------------------------------------------------------
   UI State Sync Logic
-------------------------------------------------------------------------- */

/**
 * Syncs the UI state by extracting data from all UI state databases and writing
 * the consolidated data to a JSON file.
 */
async function syncUIState(): Promise<void> {
  const exportedData: ExtractedData = {}
  try {
    const dbPaths = await getAllUIStateDatabases()

    // Extract data from all databases concurrently.
    const extractionResults = await Promise.all(
      dbPaths.map(async (dbPath: string): Promise<ExtractDatabaseResult | null> => {
        try {
          return await extractDatabase(dbPath)
        } catch (error) {
          logger.error(`Error extracting database '${dbPath}':`, error)
          return null
        }
      }),
    )

    // Merge extracted data.
    for (const result of extractionResults) {
      if (result) {
        for (const workspace in result.data) {
          if (!exportedData[workspace]) {
            exportedData[workspace] = {}
          }
          for (const tableName in result.data[workspace]) {
            exportedData[workspace][tableName] = result.data[workspace][tableName]
          }
        }
      }
    }

    // Write consolidated data to file.
    const userDataDir = getUserDataDir()
    const uiStateFile = path.join(userDataDir, 'uiState.json')
    await writeFileEnsureDir(uiStateFile, JSON.stringify(exportedData))
    logger.info(`UI state synced and written to ${uiStateFile}`)
  } catch (error) {
    logger.error('Failed to sync UI state', error)
  }
}

/**
 * Applies the stored UI state to the corresponding databases.
 * Reads the exported UI state JSON file and for each database, updates/inserts
 * key/value pairs using a single transaction per table.
 */
export async function setUIState(): Promise<void> {
  const userDataDir = getUserDataDir()
  const dbPaths = await getAllUIStateDatabases()
  const uiStatePath = path.join(userDataDir, 'uiState.json')
  let stateData: string | null = null

  try {
    await fs.access(uiStatePath)
    stateData = await readFileIfExists(uiStatePath)
    if (!stateData) {
      logger.warn(`Failed to read '${uiStatePath}'`)
      return
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      logger.info(`File missing: '${uiStatePath}'`)
      return
    } else {
      logger.error(`Failed to access '${uiStatePath}'`, error)
      return
    }
  }

  const newState: ExtractedData = JSON.parse(stateData)

  // For each database, update tables with new UI state.
  for (const dbPath of dbPaths) {
    await withDatabase(dbPath, OPEN_READWRITE, async (db) => {
      // Iterate over each table.
      for await (const {tableName} of db.each<{tableName: string}>(SELECT_TABLE_NAMES_QUERY)) {
        // Get the workspace indicator from the table.
        const rootEntry = await db.get<{value: string}>(SELECT_KEY_QUERY(tableName), {
          key: 'debug.selectedroot',
        })
        if (!rootEntry || !rootEntry.value || typeof rootEntry.value !== 'string') continue
        const workspaceName = getWorkspaceName(rootEntry.value)
        if (!workspaceName) continue
        if (!newState[workspaceName] || !newState[workspaceName][tableName]) continue

        const newTableData = newState[workspaceName][tableName]
        // Update this table in one transaction.
        await updateTable(db, dbPath, tableName, newTableData)
      }
    })
  }
}

/* --------------------------------------------------------------------------
   UI Sync Timer & VS Code Integration
-------------------------------------------------------------------------- */
let syncTimer: ReturnType<typeof setInterval> | null = null

/** Starts the periodic UI state sync. */
async function startUiSync(): Promise<void> {
  const config = getConfig()
  const syncIntervalMillis = config.uiStateSyncInterval * 60 * 1000
  syncTimer = setInterval(() => {
    syncUIState()
  }, syncIntervalMillis)
  logger.info(`UI state sync started with interval ${syncIntervalMillis}ms`)
}

/** Stops the periodic UI state sync. */
async function stopUiSync(): Promise<void> {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
    logger.info('UI state sync stopped.')
  }
}

/** Restarts the UI state sync (stop then start). */
async function restartUiSync(): Promise<void> {
  await stopUiSync()
  await startUiSync()
}

/**
 * Initializes the UI state sync process by registering VS Code configuration change listeners.
 *
 * @param context - The VS Code extension context.
 */
async function initUiSync(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gistSettingsSync.includeUIState')) {
        const config = getConfig()
        if (!config.includeUIState) {
          disposeUiSync()
        } else {
          startUiSync()
        }
      }
      if (
        e.affectsConfiguration('gistSettingsSync.uiStateSyncKeys') ||
        e.affectsConfiguration('gistSettingsSync.uiStateSyncInterval')
      ) {
        restartUiSync()
      }
    }),
  )
}

/** Cleans up the UI state sync timer. */
export function disposeUiSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}

/* --------------------------------------------------------------------------
   Exported VS Code UI Sync API
-------------------------------------------------------------------------- */
const vsCodeUiSync: UISync = {
  initUiSync,
  stopUiSync,
  startUiSync,
  restartUiSync,
  disposeUiSync,
}

export default vsCodeUiSync
