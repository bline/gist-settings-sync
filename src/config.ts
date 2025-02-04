import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";

export interface SyncConfig {
  gistId: string;
  cron: string;
  includeSettings: boolean;
  includeKeybindings: boolean;
  includeSnippets: boolean;
  includeTasks: boolean;
  includeUIState: boolean;
  includeProfiles: boolean;
  includeExtensions: boolean;
  userDataDir: string;
}

// Save gistId to VS Code settings
export async function saveGistId(gistId: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("settingsSync");
  await config.update("gistId", gistId, vscode.ConfigurationTarget.Global);
}

export function getSyncConfig(): SyncConfig {
  const config = vscode.workspace.getConfiguration("settingsSync");
  const gistId = config.get<string>("gistId", "");
  const cron = config.get<string>("cron", "");
  const includeSettings = config.get<boolean>("includeSettings", true);
  const includeKeybindings = config.get<boolean>("includeKeybindings", true);
  const includeSnippets = config.get<boolean>("includeSnippets", true);
  const includeTasks = config.get<boolean>("includeTasks", true);
  const includeUIState = config.get<boolean>("includeUIState", true);
  const includeProfiles = config.get<boolean>("includeProfiles", true);
  const includeExtensions = config.get<boolean>("includeExtensions", true);
  let userDataDir = config.get<string>("userDataDir", "");
  if (!userDataDir) {
    // Determine default user data directory based on platform.
    if (process.env["VSCODE_PORTABLE"]) {
      userDataDir = path.join(
        process.env["VSCODE_PORTABLE"],
        "user-data",
        "User",
      );
    } else if (process.platform === "win32") {
      userDataDir = path.join(process.env["APPDATA"] || "", "Code", "User");
    } else if (process.platform === "darwin") {
      userDataDir = path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Code",
        "User",
      );
    } else {
      // Linux and others.
      userDataDir = path.join(os.homedir(), ".config", "Code", "User");
    }
  }
  return {
    gistId,
    cron,
    includeSettings,
    includeKeybindings,
    includeSnippets,
    includeTasks,
    includeUIState,
    includeProfiles,
    includeExtensions,
    userDataDir,
  };
}
