import vscode from 'vscode'

import {ExtensionsManager} from '@/settingsManager/extensions'
import {KeybindingsManager} from '@/settingsManager/keybindings'
import {ProfilesManager} from '@/settingsManager/profiles'
import {SettingsManager} from '@/settingsManager/settings'
import {SnippetsManager} from '@/settingsManager/snippets'
import {TasksManager} from '@/settingsManager/tasks'
import {SettingsManagers} from '@/settingsManager/types'
import {UIStateManager} from '@/settingsManager/uiState'

function createSettingsApi(context: vscode.ExtensionContext): SettingsManagers {
  const api = {
    extensions: new ExtensionsManager(context),
    keybindings: new KeybindingsManager(context),
    profiles: new ProfilesManager(context),
    settings: new SettingsManager(context),
    snippets: new SnippetsManager(context),
    tasks: new TasksManager(context),
    uiState: new UIStateManager(context),
  }
  return api
}

export default createSettingsApi
