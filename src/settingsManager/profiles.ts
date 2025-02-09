import vscode from 'vscode'

import {SettingsManagerBase} from '@/settingsManager/base'
import {SettingsFile} from '@/settingsManager/types'

export class ProfilesManager extends SettingsManagerBase {
  constructor(context: vscode.ExtensionContext) {
    super(context)
  }
  protected async fileNames(): Promise<string[]> {
    return ['profiles.json']
  }
  public canHandle(file: SettingsFile): boolean {
    return file.fileName === 'profile.json'
  }
}
