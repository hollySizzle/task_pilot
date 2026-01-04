/**
 * QuickPickMenu E2E テスト
 * QuickPickMenuの静的メソッド・ユーティリティ機能のE2Eテスト
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { QuickPickMenu } from '../../../quick-pick-menu';
import { MenuItem } from '../../../types';

suite('QuickPickMenu E2E Test Suite', () => {
    const testWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const configPath = path.join(testWorkspacePath, '.vscode', 'task-menu.yaml');

    suiteSetup(async () => {
        // 拡張機能をアクティベート
        const extension = vscode.extensions.getExtension('hollySizzle.task-pilot');
        if (extension && !extension.isActive) {
            await extension.activate();
        }

        // テスト用の設定ファイルを作成
        const vscodeDir = path.join(testWorkspacePath, '.vscode');
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        const testConfig = `version: "1.0"
commands:
  test-cmd:
    type: terminal
    command: echo "test"
    description: Test command

menu:
  - label: Test Category
    icon: "$(beaker)"
    children:
      - label: Test Action
        icon: "$(play)"
        ref: test-cmd
  - label: Direct Action
    icon: "$(zap)"
    type: terminal
    command: echo "direct"
`;
        fs.writeFileSync(configPath, testConfig);

        // 設定をリロード
        await vscode.commands.executeCommand('taskPilot.reloadConfig');
        // 少し待機して設定が反映されるのを待つ
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    suiteTeardown(() => {
        // テスト用設定ファイルを削除
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    });

    test('createQuickPickItems should create items from menu items', () => {
        const menuItems: MenuItem[] = [
            { label: 'Test Item', icon: '$(test)', description: 'A test item' },
            { label: 'Another Item' }
        ];

        const items = QuickPickMenu.createQuickPickItems(menuItems);

        assert.strictEqual(items.length, 2, 'Should create 2 items');
        assert.strictEqual(items[0].label, '$(test) Test Item', 'First item should have icon');
        assert.strictEqual(items[0].description, 'A test item', 'First item should have description');
        assert.strictEqual(items[1].label, 'Another Item', 'Second item should not have icon');
    });

    test('createQuickPickItems should mark category items', () => {
        const menuItems: MenuItem[] = [
            {
                label: 'Category',
                children: [
                    { label: 'Child Item' }
                ]
            }
        ];

        const items = QuickPickMenu.createQuickPickItems(menuItems);

        assert.strictEqual(items[0].detail, '→ submenu', 'Category items should have submenu indicator');
    });

    test('createBackItem should create a back button', () => {
        const backItem = QuickPickMenu.createBackItem('Parent Menu');

        assert.strictEqual(backItem.label, '$(arrow-left) Back', 'Back item should have correct label');
        assert.strictEqual(backItem.description, 'to Parent Menu', 'Back item should show parent name');
        assert.strictEqual(backItem.isBack, true, 'Back item should have isBack flag');
    });

    test('isActionableItem should return true for items with ref', () => {
        const item: MenuItem = { label: 'Test', ref: 'some-command' };
        assert.strictEqual(QuickPickMenu.isActionableItem(item), true);
    });

    test('isActionableItem should return true for items with type and command', () => {
        const item: MenuItem = { label: 'Test', type: 'terminal', command: 'echo test' };
        assert.strictEqual(QuickPickMenu.isActionableItem(item), true);
    });

    test('isActionableItem should return true for items with actions', () => {
        const item: MenuItem = {
            label: 'Test',
            actions: [{ type: 'terminal', command: 'echo test' }]
        };
        assert.strictEqual(QuickPickMenu.isActionableItem(item), true);
    });

    test('isActionableItem should return false for category items', () => {
        const item: MenuItem = {
            label: 'Category',
            children: [{ label: 'Child' }]
        };
        assert.strictEqual(QuickPickMenu.isActionableItem(item), false);
    });

    test('formatLabel should add icon prefix', () => {
        assert.strictEqual(QuickPickMenu.formatLabel('Test', '$(beaker)'), '$(beaker) Test');
        assert.strictEqual(QuickPickMenu.formatLabel('Test'), 'Test');
        assert.strictEqual(QuickPickMenu.formatLabel('Test', undefined), 'Test');
    });

    test('showMenu command should be callable with config', async function() {
        this.timeout(10000);

        // コマンドが登録されていることを確認
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('taskPilot.showMenu'), 'showMenu command should be registered');

        // コマンド実行（UI表示されるが、ユーザー入力なしで終了する）
        // 注: 実際のQuickPickはユーザー入力待ちになるため、ここでは登録確認のみ
    });
});
