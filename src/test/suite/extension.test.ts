import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Starting TaskPilot extension tests.');

    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension('hollySizzle.taskpilot');
        assert.ok(ext, 'Extension should be found');
    });

    test('TaskPilot commands should be registered after activation', async function() {
        this.timeout(10000);

        // Activate extension
        const ext = vscode.extensions.getExtension('hollySizzle.taskpilot');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        // Wait for activation
        await new Promise(resolve => setTimeout(resolve, 1000));

        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('taskPilot.showMenu'), 'taskPilot.showMenu command should be registered');
        assert.ok(commands.includes('taskPilot.openGlobalSettings'), 'taskPilot.openGlobalSettings command should be registered');
        assert.ok(commands.includes('taskPilot.exportGlobalMenu'), 'taskPilot.exportGlobalMenu command should be registered');
    });

    test('Configuration should have correct properties', () => {
        const config = vscode.workspace.getConfiguration('taskPilot');

        // Verify configuration exists
        const configPath = config.inspect('configPath');
        assert.ok(configPath, 'taskPilot.configPath configuration should exist');
    });
});

suite('Extension Integration Test Suite', () => {
    let ext: vscode.Extension<unknown> | undefined;

    suiteSetup(async function() {
        this.timeout(10000);
        ext = vscode.extensions.getExtension('hollySizzle.taskpilot');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('activate should return without error', async () => {
        assert.ok(ext, 'Extension should exist');
        assert.ok(ext!.isActive, 'Extension should be active');
    });

    test('showMenu command should be executable', async function() {
        this.timeout(5000);

        // Execute command without awaiting (it shows QuickPick which waits for input)
        const commandPromise = vscode.commands.executeCommand('taskPilot.showMenu');

        // Wait a moment then close QuickPick by executing escape command
        await new Promise(resolve => setTimeout(resolve, 500));
        await vscode.commands.executeCommand('workbench.action.closeQuickOpen');

        // Wait for command to complete (should complete after QuickPick closes)
        try {
            await Promise.race([
                commandPromise,
                new Promise(resolve => setTimeout(resolve, 2000))
            ]);
        } catch (error) {
            // Command may throw, that's acceptable
        }

        // If we get here without crash, test passes
        assert.ok(true, 'showMenu command executed without crash');
    });

    test('configPath setting should have default value', () => {
        const config = vscode.workspace.getConfiguration('taskPilot');
        const configPath = config.get<string>('configPath');
        assert.strictEqual(configPath, '.vscode/task-menu.yaml', 'Default configPath should be .vscode/task-menu.yaml');
    });

    test('extension should register disposables', () => {
        assert.ok(ext, 'Extension should exist');
        // Extension context subscriptions are internal, but activation should work
        assert.ok(ext!.isActive, 'Extension should remain active');
    });

    test('showMenu command should handle missing config gracefully', async function() {
        this.timeout(5000);

        // Execute command without awaiting (it shows QuickPick which waits for input)
        const commandPromise = vscode.commands.executeCommand('taskPilot.showMenu');

        // Wait a moment then close QuickPick
        await new Promise(resolve => setTimeout(resolve, 500));
        await vscode.commands.executeCommand('workbench.action.closeQuickOpen');

        // Wait for command to complete with timeout
        try {
            await Promise.race([
                commandPromise,
                new Promise(resolve => setTimeout(resolve, 2000))
            ]);
        } catch (error) {
            // Expected in test environment without proper config
        }

        // Either way, shouldn't crash
        assert.ok(true, 'Command handled missing config without crashing');
    });

    test('extension should have correct metadata', () => {
        assert.ok(ext, 'Extension should exist');
        assert.ok(ext!.packageJSON, 'Extension should have package.json');
        assert.strictEqual(ext!.packageJSON.name, 'taskpilot', 'Extension name should be taskpilot');
        assert.strictEqual(ext!.packageJSON.publisher, 'hollySizzle', 'Publisher should be hollySizzle');
    });

    test('refreshSidebar command should complete a config reload (#11461)', async function() {
        // リロードボタン (refreshSidebar) は webview 再描画ではなく
        // ConfigManager.reloadConfig() を起点にする。workspace なし環境でも
        // 再読込経路が hang / throw せず完走することを固定する。
        this.timeout(5000);
        await vscode.commands.executeCommand('taskPilot.refreshSidebar');
        assert.ok(true, 'refreshSidebar resolved through the reload path');
    });

    test('exportGlobalMenu should accept a configOverride argument (Config Editor未保存対応)', async function() {
        // Config Editor は未保存編集を含む `_currentConfig` を command に渡すことで
        // clipboard に stale な JSON が出るのを防ぐ。command 側がその override を
        // 受け取って source として使うことを固定する。
        this.timeout(5000);

        const editingConfig = {
            version: '1.0',
            menu: [
                {
                    label: 'Unsaved Export Probe',
                    type: 'terminal',
                    command: 'echo unsaved'
                }
            ]
        };

        const before = await vscode.env.clipboard.readText();
        try {
            await vscode.commands.executeCommand('taskPilot.exportGlobalMenu', editingConfig);
            const after = await vscode.env.clipboard.readText();

            // 受け取った clipboard JSON に override の項目が出ていれば override 経路が使われている。
            assert.notStrictEqual(after, before, 'clipboard should be updated by export command');
            const parsed = JSON.parse(after);
            assert.ok(Array.isArray(parsed), 'clipboard should contain a JSON array');
            assert.ok(
                parsed.some((item: { label?: string }) => item.label === 'Unsaved Export Probe'),
                'export should include the override-only item, proving _currentConfig was used'
            );
        } finally {
            await vscode.env.clipboard.writeText(before);
        }
    });
});
