import { isCodeServer } from "@/globals"

import * as vscodeSettingsManager from "@/settingsManager/vscode"
import * as codeServerSettingsManager from '@/settingsManager/code-server'


const settingsManager = isCodeServer ? codeServerSettingsManager : vscodeSettingsManager

export default settingsManager
