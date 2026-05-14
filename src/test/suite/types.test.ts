import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { validateConfig, validateGlobalMenu, parseMenuConfig, YamlParseError } from '../../yaml-parser';
import type { MenuConfig, MenuItem, ActionType } from '../../types';

suite('Type Definition Test Suite', () => {

    suite('MenuConfig Validation', () => {

        test('should accept valid MenuConfig structure', () => {
            const validConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build',
                        icon: '$(tools)',
                        type: 'terminal',
                        command: 'npm run build'
                    }
                ]
            };

            const { result, config } = validateConfig(validConfig);
            assert.strictEqual(result.valid, true, 'Valid config should pass validation');
            assert.strictEqual(result.errors.length, 0, 'Should have no errors');
            assert.ok(config, 'Config should be returned');
            assert.strictEqual(config!.version, '1.0');
            assert.strictEqual(config!.menu.length, 1);
        });

        test('should accept MenuConfig with commands section', () => {
            const configWithCommands = {
                version: '1.0',
                commands: {
                    buildDev: {
                        type: 'terminal',
                        command: 'npm run build:dev'
                    }
                },
                menu: [
                    {
                        label: 'Build Dev',
                        ref: 'buildDev'
                    }
                ]
            };

            const { result, config } = validateConfig(configWithCommands);
            assert.strictEqual(result.valid, true);
            assert.ok(config?.commands);
            assert.ok(config?.commands!['buildDev']);
        });

        test('should reject missing version field', () => {
            const noVersion = {
                menu: [{ label: 'Test', type: 'terminal', command: 'echo test' }]
            };

            const { result } = validateConfig(noVersion);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.path === 'version'));
        });

        test('should reject missing menu field', () => {
            const noMenu = {
                version: '1.0'
            };

            const { result } = validateConfig(noMenu);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.path === 'menu'));
        });

        test('should reject non-object configuration', () => {
            const { result: result1 } = validateConfig(null);
            assert.strictEqual(result1.valid, false);
            assert.ok(result1.errors.some(e => e.message.includes('must be an object')));

            const { result: result2 } = validateConfig('string');
            assert.strictEqual(result2.valid, false);

            const { result: result3 } = validateConfig(123);
            assert.strictEqual(result3.valid, false);
        });

        test('should reject menu that is not an array', () => {
            const menuNotArray = {
                version: '1.0',
                menu: { label: 'Test' }
            };

            const { result } = validateConfig(menuNotArray);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"menu" must be an array')));
        });

        test('should reject commands that is not an object', () => {
            const commandsNotObject = {
                version: '1.0',
                commands: ['not', 'an', 'object'],
                menu: [{ label: 'Test', type: 'terminal', command: 'test' }]
            };

            const { result } = validateConfig(commandsNotObject);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"commands" must be an object')));
        });
    });

    suite('MenuItem Validation', () => {

        test('should accept valid MenuItem with action', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Run Tests',
                        icon: '$(beaker)',
                        description: 'Execute test suite',
                        type: 'terminal',
                        command: 'npm test'
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should accept MenuItem with children (category)', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build',
                        icon: '$(tools)',
                        children: [
                            { label: 'Build Dev', type: 'terminal', command: 'npm run build:dev' },
                            { label: 'Build Prod', type: 'terminal', command: 'npm run build:prod' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should accept MenuItem with ref', () => {
            const config = {
                version: '1.0',
                commands: {
                    myCommand: { type: 'terminal', command: 'echo hello' }
                },
                menu: [
                    { label: 'Run Command', ref: 'myCommand' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should reject MenuItem without label', () => {
            const config = {
                version: '1.0',
                menu: [
                    { type: 'terminal', command: 'npm test' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.path?.includes('label')));
        });

        test('should reject MenuItem without action or children', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Empty Item' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('Missing "type" or "ref"')));
        });

        test('should reject MenuItem with invalid icon type', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Test', icon: 123, type: 'terminal', command: 'test' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"icon" must be a string')));
        });

        test('should reject MenuItem with invalid description type', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Test', description: 123, type: 'terminal', command: 'test' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"description" must be a string')));
        });

        test('should reject MenuItem with children that is not an array', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Category', children: 'not-array' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"children" must be an array')));
        });

        test('should reject nested MenuItem errors', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Category',
                        children: [
                            { label: 'Valid', type: 'terminal', command: 'test' },
                            { type: 'terminal', command: 'missing label' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.path?.includes('children[1].label')));
        });

        test('should reject invalid ref type', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Test', ref: 123 }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"ref" must be a string')));
        });
    });

    suite('Global Menu Validation', () => {

        test('should accept global menu with nested actions and parallel items', () => {
            const globalMenu = [
                {
                    label: 'Utilities',
                    children: [
                        {
                            label: 'Prep + Test',
                            actions: [
                                { type: 'shellCommand', command: './scripts/prepare.sh' },
                                { type: 'terminal', command: 'npm test', terminal: 'tests' }
                            ],
                            continueOnError: true
                        },
                        {
                            label: 'Dual Watch',
                            parallel: [
                                { type: 'terminal', command: 'npm run watch:web', terminal: 'web' },
                                { type: 'terminal', command: 'npm run watch:ext', terminal: 'ext' }
                            ]
                        },
                        {
                            label: 'Open Extensions',
                            type: 'vscodeCommand',
                            command: 'workbench.view.extensions',
                            args: ['installed']
                        }
                    ]
                }
            ];

            const { result, menu } = validateGlobalMenu(globalMenu);
            assert.strictEqual(result.valid, true);
            assert.ok(menu);
            assert.strictEqual(menu?.length, 1);
        });

        test('should reject ref in global menu root item', () => {
            const { result } = validateGlobalMenu([
                { label: 'Build', ref: 'build' }
            ]);

            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.path === 'taskPilot.globalMenu[0].ref'));
        });

        test('should reject ref in global menu action item', () => {
            const { result } = validateGlobalMenu([
                {
                    label: 'CI',
                    actions: [
                        { ref: 'build' }
                    ]
                }
            ]);

            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.path === 'taskPilot.globalMenu[0].actions[0].ref'));
        });

        test('should reject ref when combined with children (category branch)', () => {
            const { result } = validateGlobalMenu([
                {
                    label: 'Bad Category',
                    ref: 'build',
                    children: [
                        { label: 'Open Settings', type: 'vscodeCommand', command: 'workbench.action.openSettings' }
                    ]
                }
            ]);

            assert.strictEqual(result.valid, false);
            assert.ok(
                result.errors.some(e => e.path === 'taskPilot.globalMenu[0].ref'),
                'ref combined with children should be rejected at the item path'
            );
        });

        test('should reject ref at item level when combined with actions array', () => {
            const { result } = validateGlobalMenu([
                {
                    label: 'Bad Actions Item',
                    ref: 'build',
                    actions: [
                        { type: 'terminal', command: 'npm test' }
                    ]
                }
            ]);

            assert.strictEqual(result.valid, false);
            assert.ok(
                result.errors.some(e => e.path === 'taskPilot.globalMenu[0].ref'),
                'ref combined with actions should be rejected at the item path'
            );
        });

        test('should reject ref at item level when combined with parallel array', () => {
            const { result } = validateGlobalMenu([
                {
                    label: 'Bad Parallel Item',
                    ref: 'watch',
                    parallel: [
                        { type: 'terminal', command: 'npm run watch:a', terminal: 'a' },
                        { type: 'terminal', command: 'npm run watch:b', terminal: 'b' }
                    ]
                }
            ]);

            assert.strictEqual(result.valid, false);
            assert.ok(
                result.errors.some(e => e.path === 'taskPilot.globalMenu[0].ref'),
                'ref combined with parallel should be rejected at the item path'
            );
        });

        test('should reject ref in nested child item', () => {
            const { result } = validateGlobalMenu([
                {
                    label: 'Utilities',
                    children: [
                        { label: 'Build', ref: 'build' }
                    ]
                }
            ]);

            assert.strictEqual(result.valid, false);
            assert.ok(
                result.errors.some(e => e.path === 'taskPilot.globalMenu[0].children[0].ref'),
                'nested child ref should be rejected with full path'
            );
        });

        test('should reject ref in nested category child with children', () => {
            const { result } = validateGlobalMenu([
                {
                    label: 'Top',
                    children: [
                        {
                            label: 'Mid',
                            ref: 'build',
                            children: [
                                { label: 'Leaf', type: 'terminal', command: 'echo leaf' }
                            ]
                        }
                    ]
                }
            ]);

            assert.strictEqual(result.valid, false);
            assert.ok(
                result.errors.some(e => e.path === 'taskPilot.globalMenu[0].children[0].ref'),
                'nested category item with ref should be rejected'
            );
        });
    });

    suite('Workspace Config - ref + children tolerance', () => {
        test('workspace config (allowRef: true) keeps tolerating ref + children for compatibility', () => {
            // workspace YAML 側は ref と children を併用しても元々通っており、runtime 上は
            // children が優先される。globalMenu の閉鎖を意識した変更で、workspace 側の
            // 互換性を不必要に壊さないことを固定する。
            const config = {
                version: '1.0',
                commands: {
                    build: { type: 'terminal', command: 'npm run build' }
                },
                menu: [
                    {
                        label: 'Category',
                        ref: 'build',
                        children: [
                            { label: 'Child', type: 'terminal', command: 'echo c' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });
    });

    suite('Global Menu Settings Schema (package.json parity)', () => {
        // package.json の `taskPilot.globalMenu` schema と runtime validation の
        // 不整合を検知する parity ガード。schema 側で「ref 非対応」「action item の
        // 最低条件」を表現しないと Settings UI が invalid object を保存できてしまうため、
        // 制約が落ちないように固定する。
        const packageJsonPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const globalMenuSchema = pkg.contributes.configuration.properties['taskPilot.globalMenu'];
        const itemsSchema = globalMenuSchema.items;

        test('top-level item schema should forbid ref via JSON Schema "not"', () => {
            assert.ok(itemsSchema.not, 'items.not should be defined');
            assert.ok(
                Array.isArray(itemsSchema.not.required) && itemsSchema.not.required.includes('ref'),
                'top-level items must declare not.required: ["ref"]'
            );
        });

        test('top-level item schema should require at least one action shape via anyOf', () => {
            assert.ok(Array.isArray(itemsSchema.anyOf), 'items.anyOf must be defined');
            const requiredKeys = itemsSchema.anyOf
                .map((branch: { required?: string[] }) => branch.required?.[0])
                .filter(Boolean) as string[];

            for (const key of ['children', 'actions', 'parallel', 'type']) {
                assert.ok(
                    requiredKeys.includes(key),
                    `anyOf should require one of children/actions/parallel/type (missing: ${key})`
                );
            }
        });

        test('nested actions[] items must require type and forbid ref', () => {
            const actionsItems = itemsSchema.properties.actions.items;
            assert.ok(
                Array.isArray(actionsItems.required) && actionsItems.required.includes('type'),
                'actions[].items.required must include "type"'
            );
            assert.ok(actionsItems.not, 'actions[].items.not should be defined');
            assert.ok(
                Array.isArray(actionsItems.not.required) && actionsItems.not.required.includes('ref'),
                'actions[].items must declare not.required: ["ref"]'
            );
        });

        test('nested parallel[] items must require type and forbid ref', () => {
            const parallelItems = itemsSchema.properties.parallel.items;
            assert.ok(
                Array.isArray(parallelItems.required) && parallelItems.required.includes('type'),
                'parallel[].items.required must include "type"'
            );
            assert.ok(parallelItems.not, 'parallel[].items.not should be defined');
            assert.ok(
                Array.isArray(parallelItems.not.required) && parallelItems.not.required.includes('ref'),
                'parallel[].items must declare not.required: ["ref"]'
            );
        });

        test('schema must not expose ref as a property of globalMenu items', () => {
            // ref を properties に出すと Settings UI の補完で勧めてしまうため、
            // properties から除外することも併せて固定する。
            assert.ok(
                itemsSchema.properties.ref === undefined,
                'schema must not expose ref as a property of taskPilot.globalMenu items'
            );

            // runtime 側でも同じケースを reject することを並行確認。
            const sample = [
                {
                    label: 'Bad',
                    ref: 'build',
                    children: [
                        { label: 'C', type: 'terminal', command: 'echo' }
                    ]
                }
            ];
            const { result } = validateGlobalMenu(sample);
            assert.strictEqual(result.valid, false);
        });
    });

    suite('ActionType Validation', () => {

        test('should accept "terminal" action type', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Test', type: 'terminal', command: 'npm test' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should accept "shellCommand" action type', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Script', type: 'shellCommand', command: 'npm test' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should accept "vscodeCommand" action type', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Save All', type: 'vscodeCommand', command: 'workbench.action.files.saveAll' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should accept "task" action type', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Run Task', type: 'task', command: 'build' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should reject invalid action type', () => {
            const config = {
                version: '1.0',
                menu: [
                    { label: 'Test', type: 'invalid', command: 'test' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e =>
                e.message.includes('must be one of:')
            ));
        });

        test('should reject action type in commands section', () => {
            const config = {
                version: '1.0',
                commands: {
                    badCommand: { type: 'invalid', command: 'test' }
                },
                menu: [
                    { label: 'Test', ref: 'badCommand' }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e =>
                e.path?.includes('commands.badCommand') &&
                e.message.includes('must be one of')
            ));
        });
    });

    suite('Terminal Action Validation', () => {

        test('should accept terminal action with optional terminal name', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build',
                        type: 'terminal',
                        command: 'npm run build',
                        terminal: 'Build Terminal'
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should accept terminal action with cwd', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build',
                        type: 'terminal',
                        command: 'npm run build',
                        cwd: '${workspaceFolder}/packages/core'
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should reject terminal action with invalid terminal type', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build',
                        type: 'terminal',
                        command: 'npm run build',
                        terminal: 123
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"terminal" must be a string')));
        });

        test('should reject terminal action with invalid cwd type', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build',
                        type: 'terminal',
                        command: 'npm run build',
                        cwd: 123
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"cwd" must be a string')));
        });
    });

    suite('Shell Command Action Validation', () => {

        test('should accept shellCommand action with cwd', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Run Script',
                        type: 'shellCommand',
                        command: 'npm run build',
                        cwd: './packages/core'
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should reject shellCommand action with invalid cwd type', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Run Script',
                        type: 'shellCommand',
                        command: 'npm run build',
                        cwd: 123
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"cwd" must be a string')));
        });
    });

    suite('VS Code Command Action Validation', () => {

        test('should accept vscodeCommand with args array', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Open File',
                        type: 'vscodeCommand',
                        command: 'vscode.open',
                        args: ['file:///path/to/file']
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should reject vscodeCommand with non-array args', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Open File',
                        type: 'vscodeCommand',
                        command: 'vscode.open',
                        args: 'not-array'
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"args" must be an array')));
        });
    });

    suite('Command Definition Validation', () => {

        test('should reject command without type', () => {
            const config = {
                version: '1.0',
                commands: {
                    noType: { command: 'npm test' }
                },
                menu: [{ label: 'Test', ref: 'noType' }]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e =>
                e.path === 'commands.noType.type' &&
                e.message.includes('Missing "type"')
            ));
        });

        test('should reject command without command field', () => {
            const config = {
                version: '1.0',
                commands: {
                    noCommand: { type: 'terminal' }
                },
                menu: [{ label: 'Test', ref: 'noCommand' }]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e =>
                e.path === 'commands.noCommand.command'
            ));
        });

        test('should reject non-object command definition', () => {
            const config = {
                version: '1.0',
                commands: {
                    badCmd: 'not-an-object'
                },
                menu: [{ label: 'Test', ref: 'badCmd' }]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e =>
                e.message.includes('Command definition must be an object')
            ));
        });
    });

    suite('parseMenuConfig Integration', () => {

        test('should parse valid YAML and return MenuConfig', () => {
            const yaml = `
version: '1.0'
menu:
  - label: Build
    type: terminal
    command: npm run build
`;
            const config = parseMenuConfig(yaml);
            assert.strictEqual(config.version, '1.0');
            assert.strictEqual(config.menu.length, 1);
            assert.strictEqual(config.menu[0].label, 'Build');
        });

        test('should throw YamlParseError for invalid YAML syntax', () => {
            const invalidYaml = `
version: '1.0'
menu:
  - label: Test
    type: terminal
  bad_indent: this is invalid
`;
            assert.throws(
                () => parseMenuConfig(invalidYaml),
                YamlParseError
            );
        });

        test('should throw YamlParseError for validation failure', () => {
            const invalidConfig = `
version: '1.0'
menu:
  - type: terminal
    command: missing label
`;
            assert.throws(
                () => parseMenuConfig(invalidConfig),
                (err: Error) => {
                    return err instanceof YamlParseError &&
                           err.message.includes('validation failed');
                }
            );
        });

        test('should parse complex nested structure', () => {
            const yaml = `
version: '1.0'
commands:
  buildDev:
    type: terminal
    command: npm run build:dev
menu:
  - label: Development
    icon: $(code)
    children:
      - label: Build Dev
        ref: buildDev
      - label: Start Dev Server
        type: terminal
        command: npm run dev
        terminal: Dev Server
`;
            const config = parseMenuConfig(yaml);
            assert.strictEqual(config.commands?.['buildDev'].type, 'terminal');
            assert.strictEqual(config.menu[0].children?.length, 2);
            assert.strictEqual(config.menu[0].children?.[0].ref, 'buildDev');
        });
    });

    suite('Actions Array Validation', () => {

        test('should accept MenuItem with actions array', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build & Test',
                        actions: [
                            { type: 'terminal', command: 'npm run build' },
                            { type: 'terminal', command: 'npm test' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should accept actions with ref', () => {
            const config = {
                version: '1.0',
                commands: {
                    build: { type: 'terminal', command: 'npm run build' }
                },
                menu: [
                    {
                        label: 'Build & Test',
                        actions: [
                            { ref: 'build' },
                            { type: 'terminal', command: 'npm test' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should accept continueOnError option', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Build All',
                        continueOnError: true,
                        actions: [
                            { type: 'terminal', command: 'npm run build:a' },
                            { type: 'terminal', command: 'npm run build:b' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, true);
        });

        test('should reject actions that is not an array', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Invalid',
                        actions: 'not-an-array'
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"actions" must be an array')));
        });

        test('should reject action without type or ref', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Invalid',
                        actions: [
                            { command: 'npm run build' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('Missing "type" or "ref"')));
        });

        test('should reject action with invalid type', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Invalid',
                        actions: [
                            { type: 'invalidType', command: 'npm run build' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"type" must be one of')));
        });

        test('should reject continueOnError that is not boolean', () => {
            const config = {
                version: '1.0',
                menu: [
                    {
                        label: 'Invalid',
                        continueOnError: 'yes',
                        actions: [
                            { type: 'terminal', command: 'npm run build' }
                        ]
                    }
                ]
            };

            const { result } = validateConfig(config);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(e => e.message.includes('"continueOnError" must be a boolean')));
        });

        test('should parse actions array from YAML', () => {
            const yaml = `
version: '1.0'
commands:
  lint:
    type: terminal
    command: npm run lint
menu:
  - label: Full Build
    continueOnError: false
    actions:
      - type: terminal
        command: npm run build
      - ref: lint
      - type: terminal
        command: npm test
`;
            const config = parseMenuConfig(yaml);
            assert.strictEqual(config.menu[0].actions?.length, 3);
            assert.strictEqual(config.menu[0].actions?.[0].type, 'terminal');
            assert.strictEqual(config.menu[0].actions?.[1].ref, 'lint');
            assert.strictEqual(config.menu[0].continueOnError, false);
        });
    });
});
