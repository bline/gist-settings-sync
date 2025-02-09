// settingsManagerBase.ts
import vscode from 'vscode'

import {getUserDataDir} from '@/config'
import {readFileIfExists, writeFileEnsureDir} from '@/fileUtils'
import {FileHandler, SettingsFile} from '@/settingsManager/types'
import path from 'path'

export abstract class SettingsManagerBase implements FileHandler {
  protected context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }
  // The key of the map is the name of the file as synced
  // The path is the path on disk, or virtually if you
  // override dataForFile and storeDateForFile
  protected abstract fileNames(): Promise<Array<string>>

  public abstract canHandle(file: SettingsFile): boolean

  protected getUserFilePath(): string {
    return getUserDataDir()
  }
  protected async dataForFile(fileName: string): Promise<string | null> {
    const filePath = await this.getPathFromFileName(fileName)
    return readFileIfExists(filePath)
  }
  protected async storeDataForFile(fileName: string, content: string): Promise<void> {
    const filePath = await this.getPathFromFileName(fileName)
    writeFileEnsureDir(filePath, content)
  }
  protected async getPathFromFileName(fileName: string): Promise<string> {
    if (fileName.startsWith('workspace-')) {
      const lastDashIndex = fileName.lastIndexOf('-')
      const workspaceName = fileName.slice(10, lastDashIndex) // Extract workspace name
      const file = fileName.slice(lastDashIndex + 1) // Extract file name
      const workspaceFolder = vscode.workspace.workspaceFolders?.find(
        (folder) => folder.name === workspaceName,
      )

      if (workspaceFolder) {
        return path.join(workspaceFolder.uri.fsPath, '.vscode', file)
      } else {
        // Handle the case where the workspace folder is not found (e.g., if the workspace was removed)
        console.warn(`Workspace folder "${workspaceName}" not found for file "${fileName}"`)
        return '' // Or you might want to throw an error, depending on your error handling strategy
      }
    }
    const userDir = this.getUserFilePath()
    return path.join(userDir, fileName)
  }

  async extract(): Promise<Array<SettingsFile>> {
    const fileNames = await this.fileNames()
    const extractedData = await Promise.all(
      fileNames.map(async (fileName) => {
        const content = await this.dataForFile(fileName)
        return {fileName, content}
      }),
    )
    return extractedData.filter(({content}) => !!content)
  }

  async store(data: Array<SettingsFile>): Promise<void> {
    await Promise.all(
      data
        .filter(({content}) => content !== null)
        .map(async ({fileName, content}) => {
          this.storeDataForFile(fileName, content!)
        }),
    )
  }
}
