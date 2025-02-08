import { describe, it, beforeEach, expect, jest } from '@jest/globals';
import { Mock, SpiedFunction } from 'jest-mock'
import { ConfigurationManager, ConfigurationKey } from '../src/ConfigurationManager';
import vscode from "vscode";

// Define the configuration scope used in ConfigurationManager.
const configurationScope = 'gistSettingsSync';

describe('ConfigurationManager', () => {
  // Prepare a fake configuration object.
  let mockConfig: { get: Mock<(key: string, defaultValue: any) => any> };
  // Spy for onDidChangeConfiguration callback.
  let onDidChangeConfigurationSpy: SpiedFunction<vscode.Event<vscode.ConfigurationChangeEvent>>

  // Create a minimal fake ExtensionContext with a subscriptions array.
  const fakeContext = { subscriptions: [] } as unknown as vscode.ExtensionContext;

  beforeEach(() => {
    // Reset mocks between tests.
    jest.clearAllMocks();

    // Create a mock configuration object that always returns the default value.
    mockConfig = {
      get: jest.fn((key: string, defaultValue: any) => defaultValue),
    };

    // Spy on vscode.workspace.getConfiguration to return our mock.
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

    // Spy on vscode.workspace.onDidChangeConfiguration so we can capture the callback.
    onDidChangeConfigurationSpy = jest.spyOn(vscode.workspace, 'onDidChangeConfiguration')
      // Return a dummy disposable
      .mockImplementation((callback: (e: vscode.ConfigurationChangeEvent) => any) => {
        // Push the callback into fakeContext.subscriptions so we can use it later.
        fakeContext.subscriptions.push({ dispose: jest.fn() });
        return { dispose: jest.fn() };
      });
  });

  it('initializes configuration with default values', () => {
    const manager = new ConfigurationManager(fakeContext);
    // For every key in configurationProperties, get should be called with the default value.
    // (configurationProperties is defined in the module, so we test a few keys.)
    expect(mockConfig.get).toHaveBeenCalledWith('gistId', '');
    expect(mockConfig.get).toHaveBeenCalledWith('includeSettings', true);
    expect(manager.get('uiStateSyncInterval')).toBe(10);
    expect(manager.get('syncUpMetaCheckAction')).toBe('ask');
  });

  it('calls registered listeners when configuration changes', () => {
    const manager = new ConfigurationManager(fakeContext);
    const listener = jest.fn();
    const key: ConfigurationKey = 'includeKeybindings';
    // Register a listener.
    manager.addListener(key, listener);

    // Change our mock to return a new value for the key.
    mockConfig.get.mockImplementation((configKey: string, defaultValue: any) => {
      if (configKey === key) {
        return false; // new value
      }
      return defaultValue;
    });

    // Simulate a configuration change event that affects only our key.
    const fakeEvent = {
      affectsConfiguration: (section: string) => section === `${configurationScope}.${key}`,
    } as vscode.ConfigurationChangeEvent;

    // Retrieve the onDidChangeConfiguration callback from our spy.
    const callback = onDidChangeConfigurationSpy.mock.calls[0][0] as (e: vscode.ConfigurationChangeEvent) => void;
    // Invoke the callback with the fake event.
    callback(fakeEvent);

    // Listener should have been called with the key and new value (false).
    expect(listener).toHaveBeenCalledWith(key, false);
    // The internal current configuration for the key is updated.
    expect(manager.get(key)).toBe(false);
  });

  it('removes listeners correctly', () => {
    const manager = new ConfigurationManager(fakeContext);
    const listener = jest.fn();
    const key: ConfigurationKey = 'cron';

    // Add then remove a listener.
    manager.addListener(key, listener);
    manager.removeListener(key, listener);

    // Simulate a configuration change event for the key.
    const fakeEvent = {
      affectsConfiguration: (section: string) => section === `${configurationScope}.${key}`,
    } as vscode.ConfigurationChangeEvent;
    const callback = onDidChangeConfigurationSpy.mock.calls[0][0] as (e: vscode.ConfigurationChangeEvent) => void;
    callback(fakeEvent);

    // Listener should not have been called because it was removed.
    expect(listener).not.toHaveBeenCalled();
  });

  it('get() returns current configuration value', () => {
    const manager = new ConfigurationManager(fakeContext);
    // Since our mock returns defaults, check for one key.
    expect(manager.get('userDataDir')).toBe('');
  });
});
