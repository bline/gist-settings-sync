import vscode from 'vscode'

import {SettingsManagerBase} from '@/settingsManager/base'
import {SettingsFile} from '@/settingsManager/types'

interface ExtensionDef {
  id: string
  version: string
  description: string
  displayName: string
}

export class ExtensionsManager extends SettingsManagerBase {
  constructor(context: vscode.ExtensionContext) {
    super(context)
  }
  protected async fileNames(): Promise<Array<string>> {
    return ['extensions.json']
  }
  public canHandle(file: SettingsFile): boolean {
    return file.fileName === 'extensions.json'
  }

  protected async dataForFile(_: string): Promise<string | null> {
    const extensions: ExtensionDef[] = vscode.extensions.all
      .filter((ext) => !ext.packageJSON.isBuiltin && ext.isActive)
      .map(({id, packageJSON}) => ({
        id,
        version: 'version' in packageJSON ? packageJSON.version : 'unknown',
        description: 'description' in packageJSON ? packageJSON.description : 'none',
        displayName: 'displayName' in packageJSON ? packageJSON.displayName : 'none',
      }))
    return JSON.stringify(extensions, null, 2)
  }

  protected async storeDataForFile(_: string, content: string): Promise<void> {
    const currentExtensions: string[] = vscode.extensions.all
      .filter((ext) => !ext.packageJSON.isBuiltin && ext.isActive)
      .map((ext) => ext.id)
    let extensions: ExtensionDef[] = []
    try {
      extensions = JSON.parse(content) as ExtensionDef[]
    } catch (e) {
      console.warn(`Failed to parse extensions`, e)
    }
    if (extensions && extensions.length) {
      await Promise.all(
        extensions
          .map((ext) => ext.id)
          .filter((id) => !currentExtensions.includes(id))
          .map(async (id) => {
            try {
              await vscode.commands.executeCommand('workbench.extensions.installExtension', id)
            } catch (e) {
              console.warn(`Failed to install extension '${id}':`, e)
            }
          }),
      )
    }
  }
}
