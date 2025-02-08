// settingsManagerBase.ts
import { getUserDataDir } from '@/config';
import { readFileIfExists, writeFileEnsureDir } from '@/fileUtils';
import { SettingsFile } from '@/settingsManager/types';
import path from 'path';
import vscode from 'vscode'

export abstract class SettingsManagerBase {
  // The key of the map is the name of the file as synced
  // The path is the path on disk, or virtually if you 
  // override dataForFile and storeDateForFile
  protected abstract get fileNames(): Array<string>

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
      const [workspaceName, file] = fileName.slice(10).split('-', 2); // Extract workspace name and file
      const workspaceFolder = vscode.workspace.workspaceFolders?.find(folder => folder.name === workspaceName);

      if (workspaceFolder) {
        return path.join(workspaceFolder.uri.fsPath, '.vscode', file);
      } else {
        // Handle the case where the workspace folder is not found (e.g., if the workspace was removed)
        console.warn(`Workspace folder "${workspaceName}" not found for file "${fileName}"`);
        return ''; // Or you might want to throw an error, depending on your error handling strategy
      }
    }
    const userDir = getUserDataDir();
    return path.join(userDir, fileName);
  }

  async extract(): Promise<Array<SettingsFile>> {
    const extractedData = await Promise.all(
      this.fileNames.map(
        async (fileName) => {
          const content = await this.dataForFile(fileName)
          return { fileName, content }
        }
      )
    );
    return extractedData.filter(({ content }) => !!content)
  }

  async store(data: Array<SettingsFile>): Promise<void> {
    await Promise.all(
      data.filter(({ content }) => content !== null).map(
        async ({ fileName, content }) => {
          this.storeDataForFile(fileName, content!)
        }
      )
    );
  }
}