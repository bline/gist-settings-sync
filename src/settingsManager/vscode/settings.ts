import { SettingsManagerBase } from "@/settingsManager/base";

export class VSCodeSettings extends SettingsManagerBase {
  protected get fileNames(): string[] {
    return ['settings.json']
  }
}