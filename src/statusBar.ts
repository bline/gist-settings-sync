import vscode from "./vscodeUtils";

let _statusBarItem: vscode.StatusBarItem | undefined

// Global variable to store the last error message.
export let lastError: string | undefined;


/**
 * Returns (and creates if needed) a status bar item.
 */
export function getStatusBarItem(): vscode.StatusBarItem {
  if (!_statusBarItem) {
    _statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    _statusBarItem.text = '$(sync) Sync'
    _statusBarItem.command = 'gistSettingsSync.syncUp'
    _statusBarItem.show()
  }
  return _statusBarItem
}

type StatusBarActions = 'syncUp' | 'syncDown' | 'syncUiState'
const statusBarMessages: Record<StatusBarActions, string> = {
  'syncUp': 'Syncing Up...',
  'syncDown': 'Syncing Down...',
  'syncUiState': 'Syncing UI State...'
}
export function setStatusBarItemSyncing(command: StatusBarActions): void {
  const statusBarItem = getStatusBarItem()
  statusBarItem.text = '$(sync~spin) ' + statusBarMessages[command]
  statusBarItem.show()
}

export function resetStatusBarItem(): void {
  const statusBarItem = getStatusBarItem()
  statusBarItem.text = '$(sync) Sync'
  statusBarItem.command = 'gistSettingsSync.syncUp'
  statusBarItem.color = undefined
}

export function setStatusBarItemError(command: StatusBarActions): void {
  const statusBarItem = getStatusBarItem()
  statusBarItem.text = '$(sync) ' + statusBarMessages[command] + 'Failed'
  statusBarItem.tooltip = 'An error occurred during the sync operation. Click for more details.'
  statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground')
  statusBarItem.command = 'gistSettingsSync.showErrorDetails'
  statusBarItem.show()
}

// A helper function to log and store errors.
export function handleError(command: StatusBarActions, error: Error): void {
  lastError = error.message
  setStatusBarItemError(command)
}

export function disposeStatusBarItem(): void {
  if (_statusBarItem) {
    _statusBarItem.dispose()
    _statusBarItem = undefined
  }
}