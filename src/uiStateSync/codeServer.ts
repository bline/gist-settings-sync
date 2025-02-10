import vscode from 'vscode'

import {SyncConfig, getConfig, getUserDataDir} from '@/config'
import {writeFileEnsureDir} from '@/fileUtils'
import {handleError, resetStatusBarItem, setStatusBarItemSyncing} from '@/statusBar'
import {ExtractedData, UISync} from '@/uiStateSync/types'
import path from 'path'

interface WebviewMessage {
  command: string
  uiState?: unknown
  error?: string
}

let _frontendPanel: vscode.WebviewPanel | undefined

async function stopUiSync(): Promise<void> {
  const config: SyncConfig = getConfig()
  if (_frontendPanel && config.includeUIState) {
    await _frontendPanel.webview.postMessage({command: 'gistSettingsSync.stopSyncUiState'})
  }
}

async function startUiSync(): Promise<void> {
  const config: SyncConfig = getConfig()
  if (_frontendPanel && config.includeUIState) {
    _frontendPanel.webview.postMessage({
      command: 'gistSettingsSync.syncUiState',
      data: {
        settings: {
          syncIntervalMillis: config.uiStateSyncInterval * 60 * 1000,
          safeKeysToSync: config.uiStateSyncKeys,
        },
      },
    })
  }
}

async function restartUiSync(): Promise<void> {
  await stopUiSync()
  await startUiSync()
}

async function initUiSync(context: vscode.ExtensionContext): Promise<void> {
  const config: SyncConfig = getConfig()
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gistSettingsSync.includeUIState')) {
        const config = getConfig()
        if (!config.includeUIState) {
          disposeUiSync()
        } else if (config.includeUIState) {
          initFrontendWebview(context)
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
  if (config.includeUIState) {
    await initFrontendWebview(context)
    startUiSync()
  }
}

/**
 * Returns the HTML content for the hidden webview.
 * The injected script uses IndexedDB to extract all databases with the prefix
 * "vscode-web-state-db" (including ones with unique workspace IDs) and sends that data
 * to the backend on login and periodically. It also implements a setUIState function
 * that updates each database’s object stores with the provided new state.
 *
 * @param context vscode context
 * @returns Promise<string> The html for the webview including the frontend javascript
 */
async function getWebviewContent(context: vscode.ExtensionContext): Promise<string> {
  const scriptPathOnDisk: vscode.Uri = vscode.Uri.joinPath(
    context.extensionUri,
    'dist',
    'web',
    'webview.js',
  )
  if (!_frontendPanel) {
    return ''
  }

  // Convert the file URI to a URI that can be loaded in the webview.
  const scriptUri: vscode.Uri = _frontendPanel.webview.asWebviewUri(scriptPathOnDisk)

  // Create a Content Security Policy (CSP) that allows scripts only from your extension.
  const csp: string = `
    default-src 'none';
    script-src ${_frontendPanel.webview.cspSource};
    style-src ${_frontendPanel.webview.cspSource} 'unsafe-inline';
  `

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Gist Settings Sync Frontend</title>
  </head>
  <body style="display: none">
    <script src="${scriptUri}"></script>
  </body>
</html>`
}

export function disposeUiSync(): void {
  if (_frontendPanel) {
    _frontendPanel.dispose()
    _frontendPanel = undefined
  }
}

/**
 * Initializes the hidden frontend webview (only for code–server).
 * This webview will periodically extract the UI state from IndexedDB and send it
 * to the backend. The sync interval is based on the configuration.
 *
 * @param context The vscode context
 * @returns Promise<void>
 */
async function initFrontendWebview(context: vscode.ExtensionContext): Promise<void> {
  if (_frontendPanel) {
    return
  }
  _frontendPanel = vscode.window.createWebviewPanel(
    'gistSettingsSyncFrontend',
    'Gist Settings Sync Frontend',
    {viewColumn: vscode.ViewColumn.Beside, preserveFocus: true},
    {enableScripts: true, retainContextWhenHidden: true},
  )
  _frontendPanel.webview.html = await getWebviewContent(context)
  _frontendPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
    if (message?.command) {
      const cmd = message.command
      switch (cmd) {
        case 'gistSettingsSync.setUiStateStart':
          setStatusBarItemSyncing('setUiState')
          break
        case 'gistSettingsSync.setUiStateFinish':
          if (message.error) {
            console.error('Error setting UI state:', message.error)
            handleError('setUiState', new Error(message.error))
          } else {
            resetStatusBarItem()
          }
          break
        case 'gistSettingsSync.syncUiStateStart':
          setStatusBarItemSyncing('syncUiState')
          break
        case 'gistSettingsSync.syncUiStateFinish':
          resetStatusBarItem()
          break
        case 'gistSettingsSync.syncUiState':
          if (message.uiState) {
            // Process the UI state payload, e.g., write to disk.
            ;(async () => {
              try {
                const userDataDir: string = getUserDataDir()
                const uiStatePath: string = path.join(userDataDir, 'uiState.json')
                await writeFileEnsureDir(uiStatePath, JSON.stringify(message.uiState, null, 2))
              } catch (err: unknown) {
                console.error('Failed to write UI state:', err)
              }
            })()
          }
          if (message.error) {
            console.error('Error syncing UI state:', message.error)
            handleError('syncUiState', new Error(message.error))
          }
          break
      }
    }
  })
}

async function importUiState(newState: ExtractedData): Promise<void> {
  if (!_frontendPanel) {
    return
  }
  const config = getConfig()
  const safeKeysToSync = config.uiStateSyncKeys
  const syncIntervalMillis = config.uiStateSyncInterval * 60 * 1000
  await _frontendPanel.webview.postMessage({
    command: 'gistSettingsSync.importUiState',
    data: {settings: {syncIntervalMillis, safeKeysToSync}, uiState: newState},
  })
}

const codeServerUiSync: UISync = {
  importUiState,
  initUiSync,
  stopUiSync,
  startUiSync,
  restartUiSync,
  disposeUiSync,
}

export default codeServerUiSync
