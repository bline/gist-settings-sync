import vscode from 'vscode'

import {isCodeServer} from '@/globals'
import {SettingsManagerBase} from '@/settingsManager/base'
import {SettingsFile} from '@/settingsManager/types'
import codeServerUiSync from '@/uiStateSync/codeServer'
import {UISync} from '@/uiStateSync/types'
import vsCodeUiSync from '@/uiStateSync/vsCode'

export class UIStateManager extends SettingsManagerBase {
  constructor(context: vscode.ExtensionContext) {
    super(context)
  }
  protected async fileNames(): Promise<Array<string>> {
    return ['uiState.json']
  }
  public canHandle({fileName}: SettingsFile): boolean {
    return fileName === 'uiState.json'
  }
  protected async storeDataForFile(fileName: string, content: string): Promise<void> {
    await super.storeDataForFile(fileName, content)
    const syncApi: UISync = isCodeServer ? codeServerUiSync : vsCodeUiSync
    await syncApi.importUiState(JSON.parse(content))
  }
}
