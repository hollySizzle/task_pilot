/**
 * ConfigManager E2E テスト
 * 設定ファイル読み込み・ファイル監視のE2Eテスト
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager } from '../../../config-manager';

suite('ConfigManager E2E Test Suite', () => {
    const testWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const configDir = path.join(testWorkspacePath, '.vscode');
    const configPath = path.join(configDir, 'task-menu.yaml');
    let configManager: ConfigManager;

    suiteSetup(async () => {
        // 拡張機能をアクティベート
        const extension = vscode.extensions.getExtension('hollySizzle.task-pilot');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        // .vscodeディレクトリを作成
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
    });

    setup(() => {
        configManager = new ConfigManager();
    });

    teardown(() => {
        configManager.dispose();
        // テスト用設定ファイルを削除
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    });

    test('ConfigManager should initialize without error', async () => {
        await assert.doesNotReject(async () => {
            await configManager.initialize();
        });
    });

    test('getConfigPath should return correct path', () => {
        const resultPath = configManager.getConfigPath();
        assert.ok(resultPath, 'Config path should be returned');
        assert.ok(resultPath.endsWith('task-menu.yaml'), 'Config path should end with task-menu.yaml');
    });

    test('getConfig should return null when no config file exists', async () => {
        await configManager.initialize();
        const config = configManager.getConfig();
        assert.strictEqual(config, null, 'Config should be null when file does not exist');
    });

    test('getConfig should return config when file exists', async () => {
        // テスト用設定ファイルを作成
        const testConfig = `version: "1.0"
menu:
  - label: Test
    type: terminal
    command: echo test
`;
        fs.writeFileSync(configPath, testConfig);

        await configManager.initialize();
        const config = configManager.getConfig();

        assert.ok(config, 'Config should be loaded');
        assert.strictEqual(config?.version, '1.0', 'Config version should be 1.0');
        assert.ok(config?.menu, 'Config should have menu');
        assert.strictEqual(config?.menu.length, 1, 'Menu should have 1 item');
    });

    test('onConfigChanged should fire on initialization', async function() {
        this.timeout(5000);

        const testConfig = `version: "1.0"
menu:
  - label: Test
    type: terminal
    command: echo test
`;
        fs.writeFileSync(configPath, testConfig);

        let eventFired = false;
        configManager.onConfigChanged(event => {
            eventFired = true;
            if (event.config) {
                assert.strictEqual(event.config.version, '1.0');
            }
        });

        await configManager.initialize();
        assert.ok(eventFired, 'onConfigChanged should fire on initialization');
    });

    test('reloadConfig should reload configuration', async function() {
        this.timeout(5000);

        // 初期設定ファイル
        const initialConfig = `version: "1.0"
menu:
  - label: Initial
    type: terminal
    command: echo initial
`;
        fs.writeFileSync(configPath, initialConfig);
        await configManager.initialize();

        let config = configManager.getConfig();
        assert.strictEqual(config?.menu[0].label, 'Initial', 'Initial label should be "Initial"');

        // 設定ファイルを更新
        const updatedConfig = `version: "2.0"
menu:
  - label: Updated
    type: terminal
    command: echo updated
`;
        fs.writeFileSync(configPath, updatedConfig);
        await configManager.reloadConfig();

        config = configManager.getConfig();
        assert.strictEqual(config?.version, '2.0', 'Version should be updated to 2.0');
        assert.strictEqual(config?.menu[0].label, 'Updated', 'Label should be "Updated"');
    });

    test('resolveAction should resolve ref to command', async () => {
        const testConfig = `version: "1.0"
commands:
  my-command:
    type: terminal
    command: npm test
    description: Run tests

menu:
  - label: Run Tests
    ref: my-command
`;
        fs.writeFileSync(configPath, testConfig);
        await configManager.initialize();

        const config = configManager.getConfig();
        assert.ok(config, 'Config should be loaded');

        const action = configManager.resolveAction(config!.menu[0]);
        assert.ok(action, 'Action should be resolved');
        assert.strictEqual(action?.type, 'terminal', 'Action type should be terminal');
        assert.strictEqual(action?.command, 'npm test', 'Action command should be npm test');
    });

    test('resolveAction should resolve inline action', async () => {
        const testConfig = `version: "1.0"
menu:
  - label: Direct Command
    type: terminal
    command: echo direct
`;
        fs.writeFileSync(configPath, testConfig);
        await configManager.initialize();

        const config = configManager.getConfig();
        const action = configManager.resolveAction(config!.menu[0]);

        assert.ok(action, 'Action should be resolved');
        assert.strictEqual(action?.command, 'echo direct', 'Command should be "echo direct"');
    });

    test('resolveActions should resolve multiple actions', async () => {
        const testConfig = `version: "1.0"
commands:
  build:
    type: terminal
    command: npm run build
  test:
    type: terminal
    command: npm test

menu:
  - label: Build and Test
    actions:
      - ref: build
      - ref: test
`;
        fs.writeFileSync(configPath, testConfig);
        await configManager.initialize();

        const config = configManager.getConfig();
        const actions = configManager.resolveActions(config!.menu[0]);

        assert.ok(actions, 'Actions should be resolved');
        assert.strictEqual(actions?.length, 2, 'Should have 2 actions');
        assert.strictEqual(actions?.[0].command, 'npm run build', 'First action should be build');
        assert.strictEqual(actions?.[1].command, 'npm test', 'Second action should be test');
    });

    test('hasMultipleActions should return true for items with multiple actions', async () => {
        const testConfig = `version: "1.0"
menu:
  - label: Multi Action
    actions:
      - type: terminal
        command: echo 1
      - type: terminal
        command: echo 2
`;
        fs.writeFileSync(configPath, testConfig);
        await configManager.initialize();

        const config = configManager.getConfig();
        const hasMultiple = configManager.hasMultipleActions(config!.menu[0]);

        assert.strictEqual(hasMultiple, true, 'Should have multiple actions');
    });

    test('File watcher should detect file changes', async function() {
        this.timeout(10000);

        // 初期設定ファイル
        const initialConfig = `version: "1.0"
menu:
  - label: Initial
    type: terminal
    command: echo initial
`;
        fs.writeFileSync(configPath, initialConfig);
        await configManager.initialize();

        // 変更イベントを待つPromise
        const changePromise = new Promise<void>((resolve) => {
            const disposable = configManager.onConfigChanged(event => {
                if (event.config?.version === '2.0') {
                    disposable.dispose();
                    resolve();
                }
            });
        });

        // 少し待ってからファイルを更新
        await new Promise(resolve => setTimeout(resolve, 500));

        const updatedConfig = `version: "2.0"
menu:
  - label: Updated
    type: terminal
    command: echo updated
`;
        fs.writeFileSync(configPath, updatedConfig);

        // 変更イベントを待つ（タイムアウト付き）
        const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout waiting for file change event')), 5000);
        });

        await Promise.race([changePromise, timeoutPromise]);

        const config = configManager.getConfig();
        assert.strictEqual(config?.version, '2.0', 'Config should be updated to version 2.0');
    });
});
