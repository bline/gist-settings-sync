import vscode from 'vscode'

/** Mapping of keys to values from a SQLite table. */
export interface UIStateData {
  [key: string]: unknown
}

/** Mapping of object store names to UI state data. */
export interface WorkspaceData {
  [storeName: string]: UIStateData
}

/** Complete UI state data grouped by workspace name. */
export interface ExtractedData {
  [workspace: string]: WorkspaceData
}

export interface UISync {
  importUiState(newState: ExtractedData): Promise<void>
  initUiSync(context: vscode.ExtensionContext): Promise<void>
  stopUiSync(): Promise<void>
  startUiSync(): Promise<void>
  restartUiSync(): Promise<void>
  disposeUiSync(): void
}
