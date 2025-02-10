import vscode from 'vscode'

import {isCodeServer} from './globals'
import {disposeStatusBarItem, getStatusBarItem, lastError} from './statusBar'
import {syncDown, syncUp} from './sync'
import createSettingsApi from '@/settingsManager'
import codeServerUiSync from '@/uiStateSync/codeServer'
import vsCodeUiSync from '@/uiStateSync/vsCode'

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
  const settingsManager = createSettingsApi(context)
  context.subscriptions.push(
    vscode.commands.registerCommand('gistSettingsSync.syncUp', () => {
      syncUp(context, settingsManager)
    }),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('gistSettingsSync.syncDown', () => {
      syncDown(context, settingsManager)
    }),
  )

  // Register the command that shows error details.
  context.subscriptions.push(
    vscode.commands.registerCommand('gistSettingsSync.showErrorDetails', () => {
      if (lastError) {
        vscode.window.showErrorMessage(`Last error: ${lastError}`)
      } else {
        vscode.window.showInformationMessage('No error details available.')
      }
    }),
  )

  // Initialize the status bar item.
  getStatusBarItem()

  const uiSync = isCodeServer ? codeServerUiSync : vsCodeUiSync
  uiSync.initUiSync(context)
}

/**
 * Called when the extension is deactivated.
 */
export function deactivate(): void {
  const uiSync = isCodeServer ? codeServerUiSync : vsCodeUiSync
  disposeStatusBarItem()
  uiSync.disposeUiSync()
}
