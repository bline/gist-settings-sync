import { isCodeServer } from './globals'
import { getConfig, SyncConfig } from './config'
import vscode from './vscode'

export interface GistFile {
  filename: string
  type: string
  language: string
  raw_url: string
  size: number
  truncated: boolean
  content: string
  encoding: string
}

export interface Meta {
  appName: string
  appHost: string
  vscodeVersion: string
}

/**
 * Given a GistFile, returns the content
 * 
 */
export async function getGistFileContent(file: GistFile): Promise<string> {
  if (!file.truncated) return file.content

  const response: Response = await fetch(file.raw_url, {
    method: 'GET'
  })
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

/**
 * Retrieves the GitHub token.
 * On code–server the token is read from the environment variable GITHUB_TOKEN.
 * On VS Code the token is stored/retrieved via the secrets API.
 */
export async function getGithubToken(context: vscode.ExtensionContext): Promise<string> {
  if (isCodeServer) {
    const token: string | undefined = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('GITHUB_TOKEN is not set in environment variables')
    }
    return token
  }
  const storedToken: string | undefined = await context.secrets.get('GITHUB_TOKEN')
  if (storedToken) {
    return storedToken
  }
  const token: string | undefined = await vscode.window.showInputBox({
    prompt: 'Enter your GitHub token with Gist permissions'
  })
  if (!token) {
    throw new Error('GitHub token not provided')
  }
  await context.secrets.store('GITHUB_TOKEN', token)
  return token
}


type CheckMetaSettingName = 'syncDownMetaCheckAction' | 'syncUpMetaCheckAction'

/**
 * This function is not pure, it's side effect is prompting the user on the action
 * to perform if the meta file check fails. If the user selects to remember the
 * choice, it's saved to the configuration setting passed as the second parameter.
 * Returns `true` to proceed with the sync, `false` to cancel.
 * @param meta GitFile
 * @param settingName
 * @returns Promise<boolean>
 */
export async function checkMeta(meta: GistFile, settingName: CheckMetaSettingName): Promise<boolean> {
  const settings = vscode.workspace.getConfiguration('gistSettingsSync')
  const metaAction = settings.get<string>(settingName, 'ask')
  const metaContent = await getGistFileContent(meta)
  const remoteMeta = JSON.parse(metaContent) as Meta
  const localVscodeVersion = vscode.version
  if (remoteMeta.vscodeVersion !== localVscodeVersion) {
    if (metaAction === "ask") {
      const choice = await vscode.window.showWarningMessage(
        'The metadata in the Gist does not match your current environment. What do you want to do?',
        { modal: true },
        'Sync Anyway (Remember my choice)',
        'Cancel (Remember my choice)',
        'Sync Anyway',
        'Cancel'
      )
      if (choice) {
        if (choice.includes('Remember')) {
          await settings.update(
            settingName,
            choice.startsWith('Sync') ? 'sync' : 'cancel')
        }
        if (choice.startsWith('Cancel')) {
          return false
        }
      }
    } else if (metaAction === 'cancel') {
      return false
    }
  }
  return true
}


export async function fetchGists(context: vscode.ExtensionContext): Promise<Record<string, GistFile>> {
  const token: string = await getGithubToken(context)
  const config: SyncConfig = getConfig()
  if (!config.gistId) {
    throw new Error('Gist ID is not set in configuration')
  }
  const url: string = `https://api.github.com/gists/${config.gistId}`
  const response: Response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json'
    }
  })
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }
  const gistData = await response.json() as { files: Record<string, GistFile> }
  return gistData.files as Record<string, GistFile>
}

export async function storeGists(context: vscode.ExtensionContext, files: Record<string, Pick<GistFile, 'content'>>): Promise<void> {
  const config = getConfig()
  const token: string = await getGithubToken(context)
  if (!config.gistId) {
    throw new Error('Gist ID is not set in configuration')
  }
  const url: string = `https://api.github.com/gists/${config.gistId}`
  const response: Response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files })
  })
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }
}
