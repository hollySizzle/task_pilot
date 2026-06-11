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
            onConfigChanged: () => ({ dispose: () => {} }),
            // 右クリック昇格 (#11597) の context 生成で参照される
            getGlobalMenu: () => [],
            containsRef: () => false
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

    suite('webview/context data attributes (#11597)', () => {

        test('menu items carry data-vscode-context with path and promotion flags', async () => {
            const { SidebarViewProvider } = await import('../../sidebar-view-provider');
            const provider = new SidebarViewProvider(
                mockContext.extensionUri,
                mockConfigManager,
                mockActionExecutor
            );

            const config = mockConfigManager.getConfig();
            const html = provider.getMenuItemsHtml(config.menu);

            assert.ok(html.includes('data-vscode-context='), 'items should carry data-vscode-context');
            assert.ok(html.includes('&quot;webviewSection&quot;:&quot;menuItem&quot;'),
                'context should declare the menuItem webview section');
            assert.ok(html.includes('&quot;taskPilotPath&quot;:&quot;0&quot;'),
                'top-level item should carry its index path');
            assert.ok(html.includes('&quot;taskPilotPromotable&quot;:true'),
                'ref-free items should be promotable');
        });

        test('taskPilotInGlobal is true only for top-level items present in globalMenu', async () => {
            const { SidebarViewProvider } = await import('../../sidebar-view-provider');
            const manager = {
                ...mockConfigManager,
                getGlobalMenu: () => [{ label: 'Direct Command', type: 'terminal', command: 'npm test' }]
            };
            const provider = new SidebarViewProvider(
                mockContext.extensionUri,
                manager,
                mockActionExecutor
            );

            const config = mockConfigManager.getConfig();
            const html = provider.getMenuItemsHtml(config.menu);

            assert.ok(html.includes('&quot;taskPilotInGlobal&quot;:true'),
                'the globalMenu-backed top-level item should be removable');
            assert.ok(html.includes('&quot;taskPilotInGlobal&quot;:false'),
                'items absent from globalMenu should not be removable');
        });

        test('ref-containing items are marked non-promotable', async () => {
            const { SidebarViewProvider } = await import('../../sidebar-view-provider');
            const manager = {
                ...mockConfigManager,
                containsRef: (item: { label: string }) => item.label === 'Test Category'
            };
            const provider = new SidebarViewProvider(
                mockContext.extensionUri,
                manager,
                mockActionExecutor
            );

            const config = mockConfigManager.getConfig();
            const html = provider.getMenuItemsHtml(config.menu);

            assert.ok(html.includes('&quot;taskPilotPromotable&quot;:false'),
                'ref-containing items must not be promotable');
        });
    });

    suite('config source footer (#11465)', () => {

        async function buildFooterHtml(managerOverrides: Record<string, unknown>): Promise<string> {
            const { SidebarViewProvider } = await import('../../sidebar-view-provider');
            const manager = {
                ...mockConfigManager,
                getEffectiveConfigPath: () => null,
                getConfigPath: () => null,
                getFallbackReason: () => undefined,
                getWorkspaceConfig: () => null,
                ...managerOverrides
            };
            const provider = new SidebarViewProvider(
                mockContext.extensionUri,
                manager,
                mockActionExecutor
            );
            return (provider as unknown as { _getConfigSourceHtml(): string })._getConfigSourceHtml();
        }

        test('shows the effective path and opens it on click when loaded normally', async () => {
            const html = await buildFooterHtml({
                getEffectiveConfigPath: () => '/ws/.vscode/task-menu.yaml',
                getConfigPath: () => '/ws/.vscode/task-menu.yaml',
                getWorkspaceConfig: () => ({ version: '1.0', menu: [] })
            });

            assert.ok(html.includes('config-source'), 'footer element should render');
            assert.ok(html.includes('task-menu.yaml'), 'footer should show the config file');
            assert.ok(html.includes('openConfigFile()'), 'footer should be clickable');
            assert.ok(!html.includes('fallback'), 'no fallback marker without fallbackReason');
        });

        test('marks fallback state and carries the reason into the tooltip', async () => {
            const reason = 'configured absolute taskPilot.configPath is not readable from this workspace: /Users/u/task-menu.yaml';
            const html = await buildFooterHtml({
                getEffectiveConfigPath: () => '/ws/.vscode/task-menu.yaml',
                getConfigPath: () => '/Users/u/task-menu.yaml',
                getFallbackReason: () => reason,
                getWorkspaceConfig: () => ({ version: '1.0', menu: [] })
            });

            assert.ok(html.includes('fallback'), 'fallback state class should be present');
            assert.ok(html.includes('/Users/u/task-menu.yaml'), 'tooltip should name the unreachable configured path');
        });

        test('marks missing state when the config could not be loaded', async () => {
            const html = await buildFooterHtml({
                getEffectiveConfigPath: () => '/ws/.vscode/task-menu.yaml',
                getConfigPath: () => '/ws/.vscode/task-menu.yaml',
                getWorkspaceConfig: () => null
            });

            assert.ok(html.includes('missing'), 'missing state class should be present');
            assert.ok(html.includes('openConfigFile()'), 'missing state remains clickable');
        });

        test('shows a non-clickable notice without a workspace folder', async () => {
            const html = await buildFooterHtml({});

            assert.ok(html.includes('disabled'), 'no-workspace state should be disabled');
            assert.ok(!html.includes('openConfigFile()'), 'no click handler without a path');
        });
    });
});
