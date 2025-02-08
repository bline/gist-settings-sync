// settingsManagerBase.ts
import { getUserDataDir } from '@/config';
import { readFileIfExists, writeFileEnsureDir } from '@/fileUtils';
import { SettingsFile } from '@/settingsManager/types';
import path from 'path';

export abstract class SettingsManagerBase {
  protected abstract get fileNames(): string[];
  protected async dataForFile(fileName: string): Promise<string | null> {
    const userDataDir = getUserDataDir()
    const filePath = path.join(userDataDir, fileName)
    return readFileIfExists(filePath)
  }
  protected async storeDataForFile(fileName: string, content: string): Promise<void> {
    const userDataDir = getUserDataDir()
    const filePath = path.join(userDataDir, fileName)
    writeFileEnsureDir(filePath, content)
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