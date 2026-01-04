/**
 * SidebarViewProvider Tests
 * TDD: テストを先に作成
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('SidebarViewProvider Test Suite', () => {
    // モック用の変数
    let mockContext: vscode.ExtensionContext;
    let mockConfigManager: any;
    let mockActionExecutor: any;

    setup(() => {
        // モックExtensionContextの作成
        mockContext = {
            subscriptions: [],
            extensionUri: vscode.Uri.file('/mock/extension'),
            extensionPath: '/mock/extension',
        } as unknown as vscode.ExtensionContext;

        // モックConfigManager
        mockConfigManager = {
            getConfig: () => ({
                version: '1.0',
                menu: [
                    {
                        label: 'Test Category',
                        icon: '$(folder)',
                        children: [
                            {
                                label: 'Test Command',
                                icon: '$(terminal)',
                                type: 'terminal',
                                command: 'echo test'
                            }
                        ]
                    },
                    {
                        label: 'Direct Command',
                        icon: '$(run)',
                        type: 'terminal',
                        command: 'npm test'
                    }
                ]
            }),
            onConfigChanged: () => ({ dispose: () => {} })
        };

        // モックActionExecutor
        mockActionExecutor = {
            execute: async () => {}
        };
    });

    test('SidebarViewProvider should be importable', async () => {
        // SidebarViewProviderがインポート可能であることを確認
        const { SidebarViewProvider } = await import('../../sidebar-view-provider');
        assert.ok(SidebarViewProvider, 'SidebarViewProvider should be defined');
    });

    test('SidebarViewProvider should have VIEW_TYPE constant', async () => {
        const { SidebarViewProvider } = await import('../../sidebar-view-provider');
        assert.strictEqual(
            SidebarViewProvider.VIEW_TYPE,
            'taskPilot.sidebarView',
            'VIEW_TYPE should be taskPilot.sidebarView'
        );
    });

    test('SidebarViewProvider constructor should accept dependencies', async () => {
        const { SidebarViewProvider } = await import('../../sidebar-view-provider');
        const provider = new SidebarViewProvider(
            mockContext.extensionUri,
            mockConfigManager,
            mockActionExecutor
        );
        assert.ok(provider, 'Provider should be created');
    });

    test('SidebarViewProvider should implement WebviewViewProvider interface', async () => {
        const { SidebarViewProvider } = await import('../../sidebar-view-provider');
        const provider = new SidebarViewProvider(
            mockContext.extensionUri,
            mockConfigManager,
            mockActionExecutor
        );

        // resolveWebviewView メソッドの存在確認
        assert.strictEqual(
            typeof provider.resolveWebviewView,
            'function',
            'resolveWebviewView method should exist'
        );
    });

    test('SidebarViewProvider should have refresh method', async () => {
        const { SidebarViewProvider } = await import('../../sidebar-view-provider');
        const provider = new SidebarViewProvider(
            mockContext.extensionUri,
            mockConfigManager,
            mockActionExecutor
        );

        // refresh メソッドの存在確認
        assert.strictEqual(
            typeof provider.refresh,
            'function',
            'refresh method should exist'
        );
    });

    test('getMenuItemsHtml should return HTML for menu items', async () => {
        const { SidebarViewProvider } = await import('../../sidebar-view-provider');
        const provider = new SidebarViewProvider(
            mockContext.extensionUri,
            mockConfigManager,
            mockActionExecutor
        );

        const config = mockConfigManager.getConfig();
        const html = provider.getMenuItemsHtml(config.menu);

        // HTMLが生成されることを確認
        assert.ok(html.length > 0, 'HTML should be generated');
        assert.ok(html.includes('Test Category'), 'HTML should contain menu label');
        assert.ok(html.includes('Direct Command'), 'HTML should contain direct command');
    });

    test('getMenuItemsHtml should handle nested items', async () => {
        const { SidebarViewProvider } = await import('../../sidebar-view-provider');
        const provider = new SidebarViewProvider(
            mockContext.extensionUri,
            mockConfigManager,
            mockActionExecutor
        );

        const config = mockConfigManager.getConfig();
        const html = provider.getMenuItemsHtml(config.menu);

        // 子要素も含まれることを確認
        assert.ok(html.includes('Test Command'), 'HTML should contain child item');
    });

    test('getMenuItemsHtml should return empty message when no config', async () => {
        const { SidebarViewProvider } = await import('../../sidebar-view-provider');

        const provider = new SidebarViewProvider(
            mockContext.extensionUri,
            mockConfigManager,
            mockActionExecutor
        );

        const html = provider.getMenuItemsHtml([]);

        // 空の場合のメッセージを確認
        assert.ok(
            html.includes('No menu items') || html.includes('empty') || html.length === 0 || html.includes('設定'),
            'Should handle empty menu'
        );
    });
});
