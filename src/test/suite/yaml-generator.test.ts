/**
 * yaml-generator.ts のテスト
 * MenuConfig から YAML 文字列を生成する機能のテスト
 */

import * as assert from 'assert';
import { generateYaml, generateMenuItemYaml } from '../../yaml-generator';
import { MenuConfig, MenuItem, CommandDefinition } from '../../types';

suite('yaml-generator Test Suite', () => {
    suite('generateYaml', () => {
        test('基本的なMenuConfigをYAMLに変換できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Test Command',
                        type: 'terminal',
                        command: 'echo hello'
                    }
                ]
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('version: "1.0"'));
            assert.ok(yaml.includes('menu:'));
            assert.ok(yaml.includes('label: Test Command'));
            assert.ok(yaml.includes('type: terminal'));
            assert.ok(yaml.includes('command: echo hello'));
        });

        test('commandsセクションを含むMenuConfigを変換できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                commands: {
                    build: {
                        type: 'terminal',
                        command: 'npm run build',
                        description: 'Build the project'
                    }
                },
                menu: [
                    {
                        label: 'Build',
                        ref: 'build'
                    }
                ]
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('commands:'));
            assert.ok(yaml.includes('build:'));
            assert.ok(yaml.includes('npm run build'));
            assert.ok(yaml.includes('ref: build'));
        });

        test('ネストした子要素を持つメニューを変換できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Development',
                        icon: '$(tools)',
                        children: [
                            {
                                label: 'Build',
                                type: 'terminal',
                                command: 'npm run build'
                            },
                            {
                                label: 'Test',
                                type: 'terminal',
                                command: 'npm test'
                            }
                        ]
                    }
                ]
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('label: Development'));
            assert.ok(yaml.includes('icon: $(tools)'));
            assert.ok(yaml.includes('children:'));
            assert.ok(yaml.includes('label: Build'));
            assert.ok(yaml.includes('label: Test'));
        });

        test('空のメニュー配列を処理できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('version: "1.0"'));
            assert.ok(yaml.includes('menu: []'));
        });

        test('vscodeCommandタイプでargsを含む場合を処理できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Open File',
                        type: 'vscodeCommand',
                        command: 'workbench.action.openFile',
                        args: ['/path/to/file']
                    }
                ]
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('type: vscodeCommand'));
            assert.ok(yaml.includes('args:'));
        });

        test('terminalタイプでcwdとterminalを含む場合を処理できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Run Server',
                        type: 'terminal',
                        command: 'npm start',
                        terminal: 'Server',
                        cwd: '${workspaceFolder}/server'
                    }
                ]
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('terminal: Server'));
            // ${}は特殊文字なのでクォートされる
            assert.ok(yaml.includes('cwd:') && yaml.includes('${workspaceFolder}/server'));
        });

        test('複数アクション(actions)を持つメニューアイテムを変換できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build and Test',
                        actions: [
                            { type: 'terminal', command: 'npm run build' },
                            { type: 'terminal', command: 'npm test' }
                        ],
                        continueOnError: true
                    }
                ]
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('actions:'));
            assert.ok(yaml.includes('npm run build'));
            assert.ok(yaml.includes('npm test'));
            assert.ok(yaml.includes('continueOnError: true'));
        });

        test('ref参照を含むactionsを変換できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                commands: {
                    build: { type: 'terminal', command: 'npm run build' }
                },
                menu: [
                    {
                        label: 'Full Build',
                        actions: [
                            { ref: 'build' },
                            { type: 'terminal', command: 'npm test' }
                        ]
                    }
                ]
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('ref: build'));
        });

        test('descriptionを持つメニューアイテムを変換できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Deploy',
                        description: 'Deploy to production',
                        type: 'terminal',
                        command: 'npm run deploy'
                    }
                ]
            };

            const yaml = generateYaml(config);

            assert.ok(yaml.includes('description: Deploy to production'));
        });
    });

    suite('generateMenuItemYaml', () => {
        test('単純なメニューアイテムを変換できる', () => {
            const item: MenuItem = {
                label: 'Simple',
                type: 'terminal',
                command: 'echo test'
            };

            const yaml = generateMenuItemYaml(item, 0);

            assert.ok(yaml.includes('label: Simple'));
            assert.ok(yaml.includes('type: terminal'));
            assert.ok(yaml.includes('command: echo test'));
        });

        test('適切なインデントで出力される', () => {
            const item: MenuItem = {
                label: 'Indented',
                type: 'terminal',
                command: 'test'
            };

            const yaml = generateMenuItemYaml(item, 2);
            const lines = yaml.split('\n');

            // インデントが4スペース（2レベル × 2スペース）で始まることを確認
            assert.ok(lines[0].startsWith('    - label:'));
        });
    });

    suite('ラウンドトリップテスト', () => {
        test('生成したYAMLをパースして元の構造と一致する', async () => {
            const { parseMenuConfig } = await import('../../yaml-parser');

            const originalConfig: MenuConfig = {
                version: '1.0',
                commands: {
                    build: {
                        type: 'terminal',
                        command: 'npm run build',
                        description: 'Build project'
                    }
                },
                menu: [
                    {
                        label: 'Development',
                        icon: '$(tools)',
                        children: [
                            {
                                label: 'Build',
                                ref: 'build'
                            },
                            {
                                label: 'Custom',
                                type: 'terminal',
                                command: 'npm run custom',
                                terminal: 'Custom Terminal',
                                cwd: '${workspaceFolder}'
                            }
                        ]
                    }
                ]
            };

            const yaml = generateYaml(originalConfig);
            const parsedConfig = parseMenuConfig(yaml);

            assert.strictEqual(parsedConfig.version, originalConfig.version);
            assert.strictEqual(parsedConfig.menu.length, originalConfig.menu.length);
            assert.strictEqual(parsedConfig.menu[0].label, 'Development');
            assert.strictEqual(parsedConfig.menu[0].children?.length, 2);
            assert.strictEqual(parsedConfig.commands?.build.command, 'npm run build');
        });
    });
});
