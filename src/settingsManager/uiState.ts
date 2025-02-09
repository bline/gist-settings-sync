import vscode from 'vscode'

import {SettingsManagerBase} from '@/settingsManager/base'
import {SettingsFile} from '@/settingsManager/types'

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
}
