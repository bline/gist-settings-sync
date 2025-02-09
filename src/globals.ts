import vscode from 'vscode'

export const isCodeServer: boolean = vscode.env.appName.toLowerCase().includes('code-server')
