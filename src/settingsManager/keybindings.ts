import vscode from 'vscode'

import {SettingsManagerBase} from '@/settingsManager/base'
import {SettingsFile} from '@/settingsManager/types'

export class KeybindingsManager extends SettingsManagerBase {
  constructor(context: vscode.ExtensionContext) {
    super(context)
  }
  protected async fileNames(): Promise<Array<string>> {
    return ['keybindings.json']
  }
  public canHandle(file: SettingsFile): boolean {
    return file.fileName === 'keybindings.json'
  }
}
