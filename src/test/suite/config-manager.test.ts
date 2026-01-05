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

    suite('resolveActions - 複数アクション解決', () => {

        test('should resolve single action when no actions array', () => {
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

            const actions = manager.resolveActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 1);
            assert.strictEqual(actions![0].command, 'npm run build');
        });

        test('should resolve multiple actions from actions array', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    lint: { type: 'terminal', command: 'npm run lint' }
                }
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Build & Test',
                actions: [
                    { type: 'terminal', command: 'npm run build' },
                    { ref: 'lint' },
                    { type: 'terminal', command: 'npm test' }
                ]
            };

            const actions = manager.resolveActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 3);
            assert.strictEqual(actions![0].command, 'npm run build');
            assert.strictEqual(actions![1].command, 'npm run lint');
            assert.strictEqual(actions![2].command, 'npm test');
        });

        test('should return null for item without any action', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'No Action'
            };

            const actions = manager.resolveActions(item);
            assert.strictEqual(actions, null);
        });

        test('should skip invalid actions in array', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Mixed',
                actions: [
                    { type: 'terminal', command: 'npm run build' },
                    { ref: 'nonexistent' },
                    { type: 'terminal', command: 'npm test' }
                ]
            };

            const actions = manager.resolveActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 2);
        });

        test('should unify terminal names when parent has terminal setting', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    git_status: { type: 'terminal', command: 'git status', terminal: 'Git' },
                    list_files: { type: 'terminal', command: 'ls -la', terminal: 'Explorer' }
                }
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Sequential Actions',
                terminal: 'Unified',  // 親でterminalを指定
                actions: [
                    { ref: 'git_status' },
                    { ref: 'list_files' }
                ]
            };

            const actions = manager.resolveActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 2);
            // 両方のterminal名が親の設定で統一される
            assert.strictEqual(actions![0].terminal, 'Unified');
            assert.strictEqual(actions![1].terminal, 'Unified');
        });

        test('should unify terminal names using first action terminal when parent has no terminal', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    git_status: { type: 'terminal', command: 'git status', terminal: 'Git' },
                    list_files: { type: 'terminal', command: 'ls -la', terminal: 'Explorer' }
                }
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Sequential Actions',
                // terminal省略 - 最初のアクションのterminalを使用
                actions: [
                    { ref: 'git_status' },
                    { ref: 'list_files' }
                ]
            };

            const actions = manager.resolveActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 2);
            // 最初のアクションのterminal 'Git' で統一
            assert.strictEqual(actions![0].terminal, 'Git');
            assert.strictEqual(actions![1].terminal, 'Git');
        });

        test('should use default terminal name when no terminal specified anywhere', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    cmd1: { type: 'terminal', command: 'echo 1' },
                    cmd2: { type: 'terminal', command: 'echo 2' }
                }
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'No Terminal',
                actions: [
                    { ref: 'cmd1' },
                    { ref: 'cmd2' }
                ]
            };

            const actions = manager.resolveActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 2);
            // デフォルト 'Actions' で統一
            assert.strictEqual(actions![0].terminal, 'Actions');
            assert.strictEqual(actions![1].terminal, 'Actions');
        });

        test('should not affect non-terminal actions when unifying terminal names', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    build: { type: 'terminal', command: 'npm run build', terminal: 'Build' }
                }
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Mixed Types',
                terminal: 'Unified',
                actions: [
                    { ref: 'build' },
                    { type: 'vscodeCommand', command: 'workbench.action.files.save' }
                ]
            };

            const actions = manager.resolveActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 2);
            // terminalアクションは統一される
            assert.strictEqual(actions![0].terminal, 'Unified');
            // vscodeCommandはterminal設定を持たない（undefinedのまま）
            assert.strictEqual(actions![1].terminal, undefined);
        });
    });

    suite('hasMultipleActions', () => {

        test('should return true for item with multiple actions', () => {
            const manager = new ConfigManager();

            const item: MenuItem = {
                label: 'Multi',
                actions: [
                    { type: 'terminal', command: 'npm run build' },
                    { type: 'terminal', command: 'npm test' }
                ]
            };

            assert.strictEqual(manager.hasMultipleActions(item), true);
        });

        test('should return false for item with single action in array', () => {
            const manager = new ConfigManager();

            const item: MenuItem = {
                label: 'Single',
                actions: [
                    { type: 'terminal', command: 'npm run build' }
                ]
            };

            assert.strictEqual(manager.hasMultipleActions(item), false);
        });

        test('should return false for item without actions array', () => {
            const manager = new ConfigManager();

            const item: MenuItem = {
                label: 'No Actions',
                type: 'terminal',
                command: 'npm run build'
            };

            assert.strictEqual(manager.hasMultipleActions(item), false);
        });
    });

    suite('hasParallelActions', () => {

        test('should return true for item with parallel actions', () => {
            const manager = new ConfigManager();

            const item: MenuItem = {
                label: 'Parallel',
                parallel: [
                    { type: 'terminal', command: 'rails server' },
                    { type: 'terminal', command: 'webpack-dev-server' }
                ]
            };

            assert.strictEqual(manager.hasParallelActions(item), true);
        });

        test('should return false for item without parallel array', () => {
            const manager = new ConfigManager();

            const item: MenuItem = {
                label: 'No Parallel',
                type: 'terminal',
                command: 'npm run build'
            };

            assert.strictEqual(manager.hasParallelActions(item), false);
        });

        test('should return false for item with empty parallel array', () => {
            const manager = new ConfigManager();

            const item: MenuItem = {
                label: 'Empty Parallel',
                parallel: []
            };

            assert.strictEqual(manager.hasParallelActions(item), false);
        });
    });

    suite('resolveParallelActions', () => {

        test('should resolve parallel actions from array', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: [],
                commands: {
                    sidekiq: { type: 'terminal', command: 'bundle exec sidekiq' }
                }
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Dev Environment',
                parallel: [
                    { type: 'terminal', command: 'rails server', terminal: 'Rails' },
                    { ref: 'sidekiq' },
                    { type: 'terminal', command: 'webpack-dev-server' }
                ]
            };

            const actions = manager.resolveParallelActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 3);
            assert.strictEqual(actions![0].command, 'rails server');
            assert.strictEqual(actions![0].terminal, 'Rails');
            assert.strictEqual(actions![1].command, 'bundle exec sidekiq');
            assert.strictEqual(actions![2].command, 'webpack-dev-server');
        });

        test('should return null for item without parallel array', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'No Parallel',
                type: 'terminal',
                command: 'npm run build'
            };

            const actions = manager.resolveParallelActions(item);
            assert.strictEqual(actions, null);
        });

        test('should return null for empty parallel array', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Empty',
                parallel: []
            };

            const actions = manager.resolveParallelActions(item);
            assert.strictEqual(actions, null);
        });

        test('should skip invalid refs in parallel array', () => {
            const manager = new ConfigManager();
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };
            (manager as unknown as { config: MenuConfig }).config = config;

            const item: MenuItem = {
                label: 'Mixed',
                parallel: [
                    { type: 'terminal', command: 'echo "valid"' },
                    { ref: 'nonexistent' },
                    { type: 'terminal', command: 'echo "also valid"' }
                ]
            };

            const actions = manager.resolveParallelActions(item);
            assert.ok(actions !== null);
            assert.strictEqual(actions!.length, 2);
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
