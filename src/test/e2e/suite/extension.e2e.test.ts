/**
 * Extension E2E テスト
 * 拡張機能のアクティベーション・コマンド登録のE2Eテスト
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension E2E Test Suite', () => {
    suiteSetup(async () => {
        // 拡張機能がアクティベートされるまで待機
        const extension = vscode.extensions.getExtension('hollySizzle.task-pilot');
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('hollySizzle.task-pilot');
        assert.ok(extension, 'Extension should be installed');
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('hollySizzle.task-pilot');
        assert.ok(extension, 'Extension should be installed');

        if (!extension.isActive) {
            await extension.activate();
        }

        assert.ok(extension.isActive, 'Extension should be active');
    });

    test('taskPilot.showMenu command should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('taskPilot.showMenu'),
            'taskPilot.showMenu command should be registered'
        );
    });

    test('taskPilot.reloadConfig command should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('taskPilot.reloadConfig'),
            'taskPilot.reloadConfig command should be registered'
        );
    });

    test('taskPilot.refreshSidebar command should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('taskPilot.refreshSidebar'),
            'taskPilot.refreshSidebar command should be registered'
        );
    });

    test('taskPilot.openEditor command should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('taskPilot.openEditor'),
            'taskPilot.openEditor command should be registered'
        );
    });

    test('reloadConfig command should execute without error', async () => {
        // reloadConfigコマンドを実行（設定ファイルがなくてもエラーにならない）
        await assert.doesNotReject(async () => {
            await vscode.commands.executeCommand('taskPilot.reloadConfig');
        });
    });

    test('refreshSidebar command should execute without error', async () => {
        await assert.doesNotReject(async () => {
            await vscode.commands.executeCommand('taskPilot.refreshSidebar');
        });
    });
});
