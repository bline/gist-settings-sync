import { getConfig, getUserDataDir, SyncConfig } from './config'
import { getStatusBarItem } from './statusBar'
import path from 'path'
import { writeFileEnsureDir } from './fileUtils'
import vscode from './vscodeUtils'


export interface WebviewMessage {
  command: string
  uiState?: unknown
  error?: string
}

let _frontendPanel: vscode.WebviewPanel | undefined

/**
 * Returns the HTML content for the hidden webview.
 * The injected script uses IndexedDB to extract all databases with the prefix
 * "vscode-web-state-db" (including ones with unique workspace IDs) and sends that data
 * to the backend on login and periodically. It also implements a setUIState function
 * that updates each database’s object stores with the provided new state.
 *
 * @param context vscode context
 * @param syncIntervalMillis The sync interval (in milliseconds) is injected into the page
 * @returns Promise<string> The html for the webview including the frontend javascript
 */
export async function getWebviewContent(
  context: vscode.ExtensionContext,
  syncIntervalMillis: number
): Promise<string> {
  const scriptUri: vscode.Uri = vscode.Uri.joinPath(
    context.extensionUri,
    'web',
    'webview.js'
  )
  const scriptBytes: Uint8Array = await vscode.workspace.fs.readFile(scriptUri)
  const scriptContent: string = scriptBytes.toString()

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Gist Settings Sync Frontend</title>
  </head>
  <body style="display: none">
    <script>
      // Inject the sync interval as a global variable.
      window.syncIntervalMillis = ${syncIntervalMillis}
    </script>
    <script>
      ${scriptContent}
    </script>
  </body>
</html>`
}

export async function getFrontendPanel(context: vscode.ExtensionContext): Promise<vscode.WebviewPanel> {
  if (_frontendPanel) {
    return _frontendPanel
  }
  await initFrontendWebview(context)

  return _frontendPanel!
}

export function disposeFrontendPanel(): void {
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
export async function initFrontendWebview(context: vscode.ExtensionContext): Promise<void> {
  if (_frontendPanel) {
    return
  }
  const config: SyncConfig = getConfig()
  const syncIntervalMillis: number = config.uiStateSyncInterval * 60 * 1000
  _frontendPanel = vscode.window.createWebviewPanel(
    'gistSettingsSyncFrontend',
    'Gist Settings Sync Frontend',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  )
  _frontendPanel.webview.html = await getWebviewContent(context, syncIntervalMillis)
  _frontendPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
    if (message?.command) {
      const cmd = message.command
      const statusBarItem = getStatusBarItem()
      switch (cmd) {
        case 'gistSettingsSync.syncUiStateStart':
          statusBarItem.text = '$(sync~spin) Syncing UI State...'
          break
        case 'gistSettingsSync.syncUiStateFinish':
          statusBarItem.text = '$(sync) Sync'
          break
        case 'gistSettingsSync.syncUiState':
          if (message.uiState) {
            // Process the UI state payload, e.g., write to disk.
            ; (async () => {
              try {
                const userDataDir: string = await getUserDataDir()
                const uiStatePath: string = path.join(userDataDir, 'uiState.json')
                await writeFileEnsureDir(uiStatePath, JSON.stringify(message.uiState, null, 2))
              } catch (err: unknown) {
                console.error('Failed to write UI state:', err)
              }
            })()
          }
          if (message.error) {
            console.error('Error syncing UI state:', message.error)
          }
          break
      }
    }
  })
}
