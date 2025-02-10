import vscode from 'vscode'

export interface UISync {
  initUiSync(context: vscode.ExtensionContext): Promise<void>
  stopUiSync(): Promise<void>
  startUiSync(): Promise<void>
  restartUiSync(): Promise<void>
  disposeUiSync(): void
}
