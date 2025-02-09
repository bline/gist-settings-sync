/**
 * web/webview.ts
 *
 * This file implements the webview frontend for syncing UI state.
 * It uses IndexedDB via the idb library (dynamically imported) to extract
 * and update safe UI state keys.
 */
import type {IDBPDatabase} from 'idb'
import {openDB} from 'idb'

/**
 * The VS Code webview host supplies a global function to acquire its API.
 * We declare its type here.
 */
declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void
}

/**
 * Type representing a mapping of keys to values from an object store.
 */
interface UIStateData {
  [key: string]: unknown
}

/**
 * A mapping of object store names to UI state data.
 */
interface WorkspaceData {
  [storeName: string]: UIStateData
}

/**
 * The complete UI state data grouped by workspace name.
 */
interface ExtractedData {
  [workspace: string]: WorkspaceData
}

/**
 * The result returned by extracting a single database.
 */
interface ExtractDatabaseResult {
  dbName: string
  data: ExtractedData
}

/**
 * The settings sent from the server
 */
interface SyncSettings {
  syncIntervalMillis: number
  safeKeysToSync: string[]
}

/**
 * The data sent from the server for syncUiState
 */
interface SyncUiStateCommand {
  settings: SyncSettings
}

/**
 * The data and settings sent from the server for setUiState
 */
interface SetUiStateCommand {
  settings: SyncSettings
  uiState: ExtractedData
}

/**
 * Determines whether a given key is safe to sync.
 * For keys with wildcards (e.g. "workbench.view.extension.*.state"),
 * the safe key is converted into a regular expression.
 *
 * @param key - The key to test.
 * @returns true if the key is allowed.
 */
function isSafeKey(key: string, safeKeysToSync: string[]): boolean {
  if (safeKeysToSync.includes(key)) {
    return true
  }
  for (const safe of safeKeysToSync) {
    if (safe.includes('*')) {
      // Escape regex special characters (except our wildcard)
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
 * Extracts the workspace name from a "debug.selectedroot" URL.
 * The expected format is:
 *   "file:///some/path/{workspaceName}/.vscode/launch.json"
 *
 * @param selectedRoot - The debug.selectedroot value.
 * @returns The workspace name if it can be determined; otherwise, null.
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
    console.error('Invalid URL in debug.selectedroot:', selectedRoot)
  }
  return null
}

/**
 * Retrieves the names of IndexedDB databases that contain UI state.
 * Uses the native indexedDB.databases() API if available.
 *
 * @returns A promise that resolves with an array of database names.
 */
async function getAllUIStateDatabases(): Promise<string[]> {
  try {
    if (indexedDB.databases) {
      const dbInfos: Array<IDBDatabaseInfo> = await indexedDB.databases()
      return dbInfos
        .filter((info) => info.name?.startsWith('vscode-web-state-db'))
        .map((info) => info.name as string)
    }
  } catch (e) {
    console.warn('Error fetching IndexedDB databases:', e)
  }
  // Fallback if indexedDB.databases() isn’t available.
  return ['vscode-web-state-db-global']
}

/**
 * Opens the specified database (using the current version) and extracts safe UI state data
 * from each object store. Data is grouped by workspace (determined via the "debug.selectedroot" key)
 * and then by object store.
 *
 * @param dbName - The name of the IndexedDB database.
 * @returns A promise that resolves with the extracted data.
 */
async function extractDatabase(
  dbName: string,
  cmd: SyncUiStateCommand,
): Promise<ExtractDatabaseResult> {
  let db: IDBPDatabase<unknown>
  try {
    db = await openDB(dbName)
  } catch (e) {
    console.error(`Failed to open IndexedDB: ${dbName}`, e)
    throw e
  }

  const result: ExtractedData = {}
  const storeNames: string[] = Array.from(db.objectStoreNames)

  for (const storeName of storeNames) {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const keys = (await store.getAllKeys()) as string[]
    const values = (await store.getAll()) as string[]
    const safeData: UIStateData = {}
    let hasSelectedRoot = false

    for (let i = 0; i < keys.length; i++) {
      // Assume keys are strings; skip if not.
      const key = typeof keys[i] === 'string' ? keys[i] : ''
      if (!key) continue

      // Include "debug.selectedroot" (to determine the workspace) or any safe key.
      if (key === 'debug.selectedroot' || isSafeKey(key, cmd.settings.safeKeysToSync)) {
        safeData[key] = values[i]
        if (key === 'debug.selectedroot') {
          hasSelectedRoot = true
        }
      }
    }
    await tx.done

    if (!hasSelectedRoot) {
      continue
    }

    const selectedRootValue = safeData['debug.selectedroot']
    if (typeof selectedRootValue !== 'string') {
      continue
    }
    const workspaceName = getWorkspaceName(selectedRootValue)
    if (!workspaceName) {
      continue
    }
    if (!result[workspaceName]) {
      result[workspaceName] = {}
    }
    result[workspaceName][storeName] = safeData
  }

  return {dbName, data: result}
}

/**
 * Aggregates safe UI state data from all databases and sends it to the extension host.
 */
async function syncUIState(cmd: SyncUiStateCommand): Promise<void> {
  vscode.postMessage({command: 'gistSettingsSync.syncUiStateStart'})
  const exportedData: ExtractedData = {}
  try {
    const dbNames = await getAllUIStateDatabases()
    const extractionResults = await Promise.all(
      dbNames.map(async (dbName: string): Promise<ExtractDatabaseResult | null> => {
        try {
          return await extractDatabase(dbName, cmd)
        } catch (e) {
          console.error(`Error extracting database ${dbName}:`, e)
          return null
        }
      }),
    )

    for (const result of extractionResults) {
      if (result) {
        for (const workspace in result.data) {
          if (!exportedData[workspace]) {
            exportedData[workspace] = {}
          }
          for (const storeName in result.data[workspace]) {
            exportedData[workspace][storeName] = result.data[workspace][storeName]
          }
        }
      }
    }

    vscode.postMessage({
      command: 'gistSettingsSync.syncUiState',
      uiState: exportedData,
    })
  } catch (err) {
    vscode.postMessage({
      command: 'gistSettingsSync.syncUiState',
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    vscode.postMessage({command: 'gistSettingsSync.syncUiStateFinish'})
  }
}

/**
 * Updates IndexedDB with the provided new UI state.
 * The incoming newState is expected to be grouped by workspace and then by store name.
 *
 * @param cmd - The new UI state data and settings.
 */
async function setUIState(cmd: SetUiStateCommand): Promise<void> {
  vscode.postMessage({command: 'gistSettingsSync.setUiStateStart'})
  const dbNames = await getAllUIStateDatabases()
  const newState: ExtractedData = cmd.uiState

  for (const dbName of dbNames) {
    try {
      const db = await openDB(dbName)
      const storeNames: string[] = Array.from(db.objectStoreNames)

      for (const storeName of storeNames) {
        try {
          const tx = db.transaction(storeName, 'readwrite')
          const store = tx.objectStore(storeName)
          const selectedRoot = await store.get('debug.selectedroot')
          if (selectedRoot === undefined) {
            await tx.done
            continue
          }
          if (typeof selectedRoot !== 'string') {
            await tx.done
            continue
          }
          const workspaceName = getWorkspaceName(selectedRoot)
          if (!workspaceName) {
            await tx.done
            continue
          }
          if (!newState[workspaceName] || !newState[workspaceName][storeName]) {
            await tx.done
            continue
          }
          const newStoreData = newState[workspaceName][storeName]
          for (const key in newStoreData) {
            await store.put(newStoreData[key], key)
          }
          await tx.done
        } catch (error) {
          console.error(`Failed to update store '${storeName}' in '${dbName}':`, error)
        }
      }

      vscode.postMessage({command: 'gistSettingsSync.setUiStateFinish'})
    } catch (error) {
      console.error(`Error opening database '${dbName}':`, error)
      vscode.postMessage({
        command: 'gistSettingsSync.setUiStateFinish',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/**
 * Get the VS Code API from the webview host.
 */
const vscode = acquireVsCodeApi()

/**
 * Listen for messages from the extension host.
 */
let syncTimerId: number | null = null
window.addEventListener('message', async (event: MessageEvent<unknown>): Promise<void> => {
  const message = event.data as {command?: string; data?: unknown} | null
  if (!message) return
  switch (message.command) {
    case 'gistSettingsSync.setUiState':
      try {
        const setCmd: SetUiStateCommand =
          typeof message.data === 'string'
            ? JSON.parse(message.data)
            : (message.data as SetUiStateCommand)
        await setUIState(setCmd)
      } catch (err) {
        console.error('Error in setUiState:', err)
        vscode.postMessage({
          command: 'gistSettingsSync.syncUiState',
          error: err instanceof Error ? err.message : String(err),
        })
      }
      break
    case 'gistSettingsSync.syncUiState': {
      const syncCmd: SyncUiStateCommand =
        typeof message.data === 'string'
          ? JSON.parse(message.data)
          : (message.data as SyncUiStateCommand)
      /**
       * Run an initial UI state sync.
       */
      syncUIState(syncCmd).catch((err: unknown) => console.error('Error during initial sync:', err))
      /**
       * Run on configurable timer
       */
      syncTimerId = window.setInterval(() => {
        syncUIState(syncCmd).catch((err: unknown) =>
          console.error('Error during periodic sync:', err),
        )
      }, syncCmd.settings.syncIntervalMillis)
      break
    }
    case 'gistSettingsSync.stopSyncUiState':
      if (syncTimerId !== null) {
        window.clearInterval(syncTimerId)
        syncTimerId = null
      }
      break
    // (ignore default case)
    default:
      break
  }
})
