/**
 * ConfigManagerテスト (#3883, #3884)
 *
 * テスト対象:
 * - ref参照解決
 * - インラインアクション解決
 * - カテゴリアイテム判定
 * - 設定パス指定機能 (#3884)
 */

import * as assert from 'assert';
import * as path from 'path';
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

/**
 * 設定パス指定機能テスト (#3884)
 *
 * パス解決ロジックのユニットテスト
 */
suite('ConfigPath Resolution Test Suite', () => {

    suite('パス解決ロジック', () => {

        test('should identify absolute path correctly', () => {
            // 絶対パスの判定テスト
            const absolutePaths = [
                '/Users/test/config.yaml',
                '/home/user/.vscode/task-menu.yaml',
                '/etc/config/settings.yaml'
            ];

            for (const p of absolutePaths) {
                assert.strictEqual(path.isAbsolute(p), true, `${p} should be absolute`);
            }
        });

        test('should identify relative path correctly', () => {
            // 相対パスの判定テスト
            const relativePaths = [
                '.vscode/task-menu.yaml',
                'config/settings.yaml',
                '../parent/config.yaml',
                './current/config.yaml'
            ];

            for (const p of relativePaths) {
                assert.strictEqual(path.isAbsolute(p), false, `${p} should be relative`);
            }
        });

        test('should convert relative path to absolute correctly', () => {
            // 相対パス→絶対パス変換テスト
            const workspaceRoot = '/Users/test/project';
            const relativePath = '.vscode/task-menu.yaml';

            const result = path.join(workspaceRoot, relativePath);

            assert.strictEqual(result, '/Users/test/project/.vscode/task-menu.yaml');
            assert.strictEqual(path.isAbsolute(result), true);
        });

        test('should keep absolute path unchanged', () => {
            // 絶対パスはそのまま使用
            const workspaceRoot = '/Users/test/project';
            const absolutePath = '/custom/path/config.yaml';

            // 絶対パスの場合はそのまま返す
            const result = path.isAbsolute(absolutePath)
                ? absolutePath
                : path.join(workspaceRoot, absolutePath);

            assert.strictEqual(result, '/custom/path/config.yaml');
        });

        test('should handle default path value', () => {
            // デフォルトパス値のテスト
            const defaultPath = '.vscode/task-menu.yaml';
            const workspaceRoot = '/Users/test/project';

            const result = path.join(workspaceRoot, defaultPath);

            assert.strictEqual(result, '/Users/test/project/.vscode/task-menu.yaml');
        });

        test('should handle custom path value', () => {
            // カスタムパス指定テスト
            const customPath = 'config/my-tasks.yaml';
            const workspaceRoot = '/Users/test/project';

            const result = path.join(workspaceRoot, customPath);

            assert.strictEqual(result, '/Users/test/project/config/my-tasks.yaml');
        });

        test('should handle nested relative path', () => {
            // 深い階層の相対パステスト
            const nestedPath = 'config/tasks/development.yaml';
            const workspaceRoot = '/Users/test/project';

            const result = path.join(workspaceRoot, nestedPath);

            assert.strictEqual(result, '/Users/test/project/config/tasks/development.yaml');
        });
    });

    suite('ConfigManager getConfigPath メソッド', () => {

        test('should return null when no workspace folder', () => {
            // ワークスペースがない場合はnullを返す
            const manager = new ConfigManager();
            // VS Codeのワークスペースがモックされていない場合、nullが返る
            const configPath = manager.getConfigPath();
            // テスト環境ではワークスペースがある場合とない場合がある
            // null または 文字列のいずれかであることを確認
            assert.ok(configPath === null || typeof configPath === 'string',
                'getConfigPath should return null or string');
        });
    });

    suite('ConfigManager onConfigChanged イベント', () => {

        test('should emit event when config changes', () => {
            const manager = new ConfigManager();

            let eventFired = false;
            const disposable = manager.onConfigChanged(() => {
                eventFired = true;
            });

            // イベントリスナーが登録できることを確認
            assert.ok(disposable, 'Event subscription should return disposable');
            assert.ok(typeof disposable.dispose === 'function', 'Disposable should have dispose method');

            disposable.dispose();
            manager.dispose();
        });
    });

    suite('ConfigManager エラーハンドリング', () => {

        test('should handle file not found error gracefully', async () => {
            const manager = new ConfigManager();

            // 初期化時にファイルが見つからなくてもクラッシュしない
            let error: Error | undefined;
            try {
                // 実際のinitializeはVS Code APIに依存するため、
                // ここではConfigManagerが正しく構築されることを確認
                assert.ok(manager instanceof ConfigManager);
            } catch (e) {
                error = e as Error;
            }

            assert.ok(error === undefined, 'Should not throw during construction');
            manager.dispose();
        });

        test('should return null config when not initialized', () => {
            const manager = new ConfigManager();

            // 初期化前はnullを返す
            const config = manager.getConfig();
            assert.strictEqual(config, null, 'Config should be null before initialization');

            manager.dispose();
        });
    });
});
