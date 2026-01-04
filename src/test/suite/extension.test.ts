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
