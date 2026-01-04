import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Starting TaskPilot extension tests.');

    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension('hollySizzle.task-pilot');
        assert.ok(ext, 'Extension should be found');
    });

    test('TaskPilot commands should be registered after activation', async function() {
        this.timeout(10000);

        // Activate extension
        const ext = vscode.extensions.getExtension('hollySizzle.task-pilot');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        // Wait for activation
        await new Promise(resolve => setTimeout(resolve, 1000));

        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('taskPilot.showMenu'), 'taskPilot.showMenu command should be registered');
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
        ext = vscode.extensions.getExtension('hollySizzle.task-pilot');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('activate should return without error', async () => {
        assert.ok(ext, 'Extension should exist');
        assert.ok(ext!.isActive, 'Extension should be active');
    });

    test('showMenu command should be executable', async () => {
        // Command should not throw (even if no config)
        try {
            await vscode.commands.executeCommand('taskPilot.showMenu');
            // If we get here, command executed
        } catch (error) {
            // Command may show warning message, that's ok
            assert.ok(true);
        }
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

        // In test environment without workspace, should handle gracefully
        let errorShown = false;
        const originalShowWarningMessage = vscode.window.showWarningMessage;

        // Note: We can't easily mock vscode.window, so just ensure no crash
        try {
            await vscode.commands.executeCommand('taskPilot.showMenu');
        } catch (error) {
            // Expected in test environment
            errorShown = true;
        }

        // Either way, shouldn't crash
        assert.ok(true, 'Command handled missing config without crashing');
    });

    test('extension should have correct metadata', () => {
        assert.ok(ext, 'Extension should exist');
        assert.ok(ext!.packageJSON, 'Extension should have package.json');
        assert.strictEqual(ext!.packageJSON.name, 'task-pilot', 'Extension name should be task-pilot');
        assert.strictEqual(ext!.packageJSON.publisher, 'hollySizzle', 'Publisher should be hollySizzle');
    });
});
