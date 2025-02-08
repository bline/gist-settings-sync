import { syncDown, syncUp } from './sync'
import { disposeStatusBarItem, getStatusBarItem, lastError } from './statusBar'
import { getConfig, SyncConfig } from './config'
import { disposeFrontendPanel, initFrontendWebview } from './webview'
import { isCodeServer } from './globals'
import vscode from './vscodeUtils'

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gistSettingsSync.syncUp', () => {
      syncUp(context)
    })
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('gistSettingsSync.syncDown', () => {
      syncDown(context)
    })
  )

  // Register the command that shows error details.
  context.subscriptions.push(
    vscode.commands.registerCommand('gistSettingsSync.showErrorDetails', () => {
      if (lastError) {
        vscode.window.showErrorMessage(`Last error: ${lastError}`)
      } else {
        vscode.window.showInformationMessage('No error details available.')
      }
    })
  )

  // Initialize the status bar item.
  getStatusBarItem()


  // For code–server: if UI state sync is enabled, initialize the hidden frontend webview.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gistSettingsSync.includeUIState')) {
        const config: SyncConfig = getConfig()
        if (!config.includeUIState) {
          disposeFrontendPanel()
        } else if (config.includeUIState && isCodeServer) {
          initFrontendWebview(context)
        }
      }
    })
  )
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  disposeStatusBarItem()
  disposeFrontendPanel()
}
