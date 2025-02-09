export interface SettingsFile {
  fileName: string
  content: string | null
}

export interface FileHandler {
  canHandle(file: SettingsFile): boolean
  store(file: SettingsFile[]): Promise<void>
  extract(): Promise<SettingsFile[]>
}

export type SettingsManagers = Record<string, FileHandler>
