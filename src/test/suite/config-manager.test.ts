/**
 * ConfigManagerテスト (#3883)
 *
 * テスト対象:
 * - ref参照解決
 * - インラインアクション解決
 * - カテゴリアイテム判定
 */

import * as assert from 'assert';
import { ConfigManager } from '../../config-manager';
import { MenuItem, MenuConfig } from '../../types';

suite('ConfigManager Test Suite', () => {

    suite('resolveAction - ref参照解決', () => {

        test('should resolve simple ref reference', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    build: {
                        type: 'terminal',
                        command: 'npm run build'
                    }
                }
            };
            // ConfigManagerに設定を直接セット（テスト用）
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Build',
                ref: 'build'
            };

            const action = manager.resolveAction(item);
            assert.ok(action !== null);
            assert.strictEqual(action!.type, 'terminal');
            assert.strictEqual(action!.command, 'npm run build');
        });

        test('should resolve ref with all properties', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    dev_server: {
                        type: 'terminal',
                        command: 'npm run dev',
                        terminal: 'dev',
                        cwd: '${workspaceFolder}',
                        description: 'Start dev server'
                    }
                }
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Dev Server',
                ref: 'dev_server'
            };

            const action = manager.resolveAction(item);
            assert.ok(action !== null);
            assert.strictEqual(action!.type, 'terminal');
            assert.strictEqual(action!.command, 'npm run dev');
            assert.strictEqual(action!.terminal, 'dev');
            assert.strictEqual(action!.cwd, '${workspaceFolder}');
            assert.strictEqual(action!.description, 'Start dev server');
        });

        test('should return null for undefined ref', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    build: {
                        type: 'terminal',
                        command: 'npm run build'
                    }
                }
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Unknown',
                ref: 'nonexistent'
            };

            const action = manager.resolveAction(item);
            assert.strictEqual(action, null);
        });

        test('should return null when commands is undefined', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Build',
                ref: 'build'
            };

            const action = manager.resolveAction(item);
            assert.strictEqual(action, null);
        });
    });

    suite('resolveAction - インラインアクション', () => {

        test('should resolve inline terminal action', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Build',
                type: 'terminal',
                command: 'npm run build'
            };

            const action = manager.resolveAction(item);
            assert.ok(action !== null);
            assert.strictEqual(action!.type, 'terminal');
            assert.strictEqual(action!.command, 'npm run build');
        });

        test('should resolve inline vscodeCommand action', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Format',
                type: 'vscodeCommand',
                command: 'editor.action.formatDocument'
            };

            const action = manager.resolveAction(item);
            assert.ok(action !== null);
            assert.strictEqual(action!.type, 'vscodeCommand');
            assert.strictEqual(action!.command, 'editor.action.formatDocument');
        });

        test('should resolve inline action with all properties', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Test',
                type: 'terminal',
                command: 'npm test',
                terminal: 'test-runner',
                args: ['--coverage'],
                cwd: './packages/core',
                description: 'Run tests'
            };

            const action = manager.resolveAction(item);
            assert.ok(action !== null);
            assert.strictEqual(action!.type, 'terminal');
            assert.strictEqual(action!.command, 'npm test');
            assert.strictEqual(action!.terminal, 'test-runner');
            assert.deepStrictEqual(action!.args, ['--coverage']);
            assert.strictEqual(action!.cwd, './packages/core');
            assert.strictEqual(action!.description, 'Run tests');
        });

        test('should return null for item without type or command', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'No Action'
            };

            const action = manager.resolveAction(item);
            assert.strictEqual(action, null);
        });

        test('should return null for item with type but no command', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Incomplete',
                type: 'terminal'
            };

            const action = manager.resolveAction(item);
            assert.strictEqual(action, null);
        });
    });

    suite('resolveAction - カテゴリアイテム', () => {

        test('should return null for category item with children', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Development',
                children: [
                    { label: 'Build', type: 'terminal', command: 'npm build' },
                    { label: 'Test', type: 'terminal', command: 'npm test' }
                ]
            };

            const action = manager.resolveAction(item);
            assert.strictEqual(action, null);
        });

        test('should return null for category with empty children array', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Empty Category',
                children: []
            };

            // 空のchildrenはカテゴリとして扱わない
            const action = manager.resolveAction(item);
            // 空の配列はchildren.length > 0がfalseなのでアクションなしとなる
            assert.strictEqual(action, null);
        });
    });

    suite('getConfig', () => {

        test('should return null when config not loaded', () => {
            const manager = new ConfigManager();
            assert.strictEqual(manager.getConfig(), null);
        });

        test('should return config when set', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [{ label: 'Test' }]
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const result = manager.getConfig();
            assert.ok(result !== null);
            assert.strictEqual(result!.version, '1.0');
            assert.strictEqual(result!.menu.length, 1);
        });
    });

    suite('dispose', () => {

        test('should dispose without error', () => {
            const manager = new ConfigManager();
            assert.doesNotThrow(() => {
                manager.dispose();
            });
        });

        test('should dispose multiple times without error', () => {
            const manager = new ConfigManager();
            assert.doesNotThrow(() => {
                manager.dispose();
                manager.dispose();
            });
        });
    });
});
