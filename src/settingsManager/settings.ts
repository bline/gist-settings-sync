import vscode from 'vscode'

import {SettingsManagerBase} from '@/settingsManager/base'
import {SettingsFile} from '@/settingsManager/types'
import fs from 'fs/promises'
import path from 'path'

export class SettingsManager extends SettingsManagerBase {
  constructor(context: vscode.ExtensionContext) {
    super(context)
  }
  protected async fileNames(): Promise<string[]> {
    const files = []
    files.push('settings.json')
    const folders = vscode.workspace.workspaceFolders
    if (folders) {
      await Promise.all(
        folders.map(async (folder) => {
          const settingsPath = path.join(folder.uri.fsPath, '.vscode', 'settings.json')
          try {
            await fs.access(settingsPath)
            files.push(`workspace-${folder.name}-settings.json`)
          } catch (_) {
            // ignore
          }
          return
        }),
      )
    }
    return files
  }
  public canHandle(file: SettingsFile): boolean {
    return file.fileName.endsWith('settings.json')
  }
}
