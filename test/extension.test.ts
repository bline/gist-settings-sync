import * as assert from 'assert';
import * as vscode from 'vscode';
import { getSyncConfig } from '../src/config';
import { syncUp, syncDown } from '../src/syncManager';

suite('Settings Sync Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Configuration should load default values', () => {
        const config = getSyncConfig();
        // Check that default values are set, e.g. includeSettings should be true.
        assert.strictEqual(config.includeSettings, true);
        // The default gistId is empty.
        assert.strictEqual(config.gistId, '');
    });

    test('SyncUp without configured Gist ID should throw error', async () => {
        const fakeContext = {
            secrets: {
                get: async (key: string) => 'fake-token',
                store: async (key: string, value: string) => {}
            },
            subscriptions: []
        } as unknown as vscode.ExtensionContext;
        let errorCaught = false;
        try {
            await syncUp(fakeContext);
        } catch (err: unknown) {
            errorCaught = true;
            assert.strictEqual((err as Error).message, 'Gist ID is not configured.');
        }
        assert.strictEqual(errorCaught, true);
    });

    test('SyncDown without configured Gist ID should throw error', async () => {
        const fakeContext = {
            secrets: {
                get: async (key: string) => 'fake-token',
                store: async (key: string, value: string) => {}
            },
            subscriptions: []
        } as unknown as vscode.ExtensionContext;
        let errorCaught = false;
        try {
            await syncDown(fakeContext);
        } catch (err: unknown) {
            errorCaught = true;
            assert.strictEqual((err as Error).message, 'Gist ID is not configured.');
        }
        assert.strictEqual(errorCaught, true);
    });
});
