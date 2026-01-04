/**
 * ConfigEditor のテスト
 * 設定ファイルGUIエディタ機能のテスト
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ConfigEditor, EditorMessage, MenuItemEdit } from '../../config-editor';
import { MenuConfig, MenuItem } from '../../types';

suite('ConfigEditor Test Suite', () => {
    let editor: ConfigEditor;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        editor = new ConfigEditor();
    });

    teardown(() => {
        sandbox.restore();
        editor.dispose();
    });

    suite('メニューアイテム編集機能', () => {
        test('addMenuItem - ルートレベルにアイテムを追加できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    { label: 'Existing Item', type: 'terminal', command: 'test' }
                ]
            };

            const newItem: MenuItem = {
                label: 'New Item',
                type: 'terminal',
                command: 'echo new'
            };

            const result = editor.addMenuItem(config, newItem);

            assert.strictEqual(result.menu.length, 2);
            assert.strictEqual(result.menu[1].label, 'New Item');
        });

        test('addMenuItem - 特定のインデックスに挿入できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    { label: 'First', type: 'terminal', command: 'test1' },
                    { label: 'Second', type: 'terminal', command: 'test2' }
                ]
            };

            const newItem: MenuItem = {
                label: 'Inserted',
                type: 'terminal',
                command: 'inserted'
            };

            const result = editor.addMenuItem(config, newItem, [1]);

            assert.strictEqual(result.menu.length, 3);
            assert.strictEqual(result.menu[1].label, 'Inserted');
            assert.strictEqual(result.menu[2].label, 'Second');
        });

        test('addMenuItem - ネストした位置に追加できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Parent',
                        children: [
                            { label: 'Child1', type: 'terminal', command: 'c1' }
                        ]
                    }
                ]
            };

            const newItem: MenuItem = {
                label: 'Child2',
                type: 'terminal',
                command: 'c2'
            };

            const result = editor.addMenuItem(config, newItem, [0, 1]);

            assert.strictEqual(result.menu[0].children?.length, 2);
            assert.strictEqual(result.menu[0].children?.[1].label, 'Child2');
        });

        test('updateMenuItem - アイテムを更新できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    { label: 'Original', type: 'terminal', command: 'original' }
                ]
            };

            const updated: MenuItem = {
                label: 'Updated',
                type: 'terminal',
                command: 'updated'
            };

            const result = editor.updateMenuItem(config, [0], updated);

            assert.strictEqual(result.menu[0].label, 'Updated');
            assert.strictEqual(result.menu[0].command, 'updated');
        });

        test('updateMenuItem - ネストしたアイテムを更新できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Parent',
                        children: [
                            { label: 'Child', type: 'terminal', command: 'old' }
                        ]
                    }
                ]
            };

            const updated: MenuItem = {
                label: 'Updated Child',
                type: 'terminal',
                command: 'new'
            };

            const result = editor.updateMenuItem(config, [0, 0], updated);

            assert.strictEqual(result.menu[0].children?.[0].label, 'Updated Child');
        });

        test('deleteMenuItem - アイテムを削除できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    { label: 'First', type: 'terminal', command: 'test1' },
                    { label: 'Second', type: 'terminal', command: 'test2' }
                ]
            };

            const result = editor.deleteMenuItem(config, [0]);

            assert.strictEqual(result.menu.length, 1);
            assert.strictEqual(result.menu[0].label, 'Second');
        });

        test('deleteMenuItem - ネストしたアイテムを削除できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Parent',
                        children: [
                            { label: 'Child1', type: 'terminal', command: 'c1' },
                            { label: 'Child2', type: 'terminal', command: 'c2' }
                        ]
                    }
                ]
            };

            const result = editor.deleteMenuItem(config, [0, 0]);

            assert.strictEqual(result.menu[0].children?.length, 1);
            assert.strictEqual(result.menu[0].children?.[0].label, 'Child2');
        });
    });

    suite('アイテム並び替え機能', () => {
        test('moveMenuItem - 同じレベル内で上に移動できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    { label: 'First', type: 'terminal', command: 't1' },
                    { label: 'Second', type: 'terminal', command: 't2' },
                    { label: 'Third', type: 'terminal', command: 't3' }
                ]
            };

            const result = editor.moveMenuItem(config, [2], [0]);

            assert.strictEqual(result.menu[0].label, 'Third');
            assert.strictEqual(result.menu[1].label, 'First');
            assert.strictEqual(result.menu[2].label, 'Second');
        });

        test('moveMenuItem - 同じレベル内で下に移動できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    { label: 'First', type: 'terminal', command: 't1' },
                    { label: 'Second', type: 'terminal', command: 't2' },
                    { label: 'Third', type: 'terminal', command: 't3' }
                ]
            };

            const result = editor.moveMenuItem(config, [0], [2]);

            assert.strictEqual(result.menu[0].label, 'Second');
            assert.strictEqual(result.menu[1].label, 'Third');
            assert.strictEqual(result.menu[2].label, 'First');
        });

        test('moveMenuItem - 異なる親の下に移動できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [
                    {
                        label: 'Parent1',
                        children: [
                            { label: 'Child1', type: 'terminal', command: 'c1' }
                        ]
                    },
                    {
                        label: 'Parent2',
                        children: []
                    }
                ]
            };

            const result = editor.moveMenuItem(config, [0, 0], [1, 0]);

            assert.strictEqual(result.menu[0].children?.length, 0);
            assert.strictEqual(result.menu[1].children?.length, 1);
            assert.strictEqual(result.menu[1].children?.[0].label, 'Child1');
        });
    });

    suite('commands編集機能', () => {
        test('addCommand - 新しいコマンドを追加できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: []
            };

            const result = editor.addCommand(config, 'build', {
                type: 'terminal',
                command: 'npm run build'
            });

            assert.ok(result.commands);
            assert.strictEqual(result.commands.build.command, 'npm run build');
        });

        test('updateCommand - コマンドを更新できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                commands: {
                    build: { type: 'terminal', command: 'npm run build' }
                },
                menu: []
            };

            const result = editor.updateCommand(config, 'build', {
                type: 'terminal',
                command: 'npm run build:prod'
            });

            assert.strictEqual(result.commands?.build.command, 'npm run build:prod');
        });

        test('deleteCommand - コマンドを削除できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                commands: {
                    build: { type: 'terminal', command: 'npm run build' },
                    test: { type: 'terminal', command: 'npm test' }
                },
                menu: []
            };

            const result = editor.deleteCommand(config, 'build');

            assert.ok(!result.commands?.build);
            assert.ok(result.commands?.test);
        });

        test('renameCommand - コマンド名を変更できる', () => {
            const config: MenuConfig = {
                version: '1.0',
                commands: {
                    oldName: { type: 'terminal', command: 'test' }
                },
                menu: [
                    { label: 'Test', ref: 'oldName' }
                ]
            };

            const result = editor.renameCommand(config, 'oldName', 'newName');

            assert.ok(!result.commands?.oldName);
            assert.ok(result.commands?.newName);
            // ref参照も更新される
            assert.strictEqual(result.menu[0].ref, 'newName');
        });
    });

    suite('バリデーション', () => {
        test('validateMenuItem - 有効なアイテムを検証できる', () => {
            const item: MenuItem = {
                label: 'Valid',
                type: 'terminal',
                command: 'test'
            };

            const errors = editor.validateMenuItem(item);

            assert.strictEqual(errors.length, 0);
        });

        test('validateMenuItem - ラベルが空の場合エラー', () => {
            const item: MenuItem = {
                label: '',
                type: 'terminal',
                command: 'test'
            };

            const errors = editor.validateMenuItem(item);

            assert.ok(errors.some(e => e.includes('label')));
        });

        test('validateMenuItem - children無しでactionも無い場合エラー', () => {
            const item: MenuItem = {
                label: 'Invalid'
            };

            const errors = editor.validateMenuItem(item);

            assert.ok(errors.length > 0);
        });

        test('validateMenuItem - childrenがある場合はaction不要', () => {
            const item: MenuItem = {
                label: 'Category',
                children: [
                    { label: 'Child', type: 'terminal', command: 'test' }
                ]
            };

            const errors = editor.validateMenuItem(item);

            assert.strictEqual(errors.length, 0);
        });
    });

    suite('Undo/Redo機能', () => {
        test('canUndo - 履歴がある場合trueを返す', () => {
            const config: MenuConfig = {
                version: '1.0',
                menu: [{ label: 'Test', type: 'terminal', command: 'test' }]
            };

            editor.pushHistory(config);

            assert.strictEqual(editor.canUndo(), true);
        });

        test('canUndo - 履歴が空の場合falseを返す', () => {
            assert.strictEqual(editor.canUndo(), false);
        });

        test('undo - 前の状態に戻れる', () => {
            const config1: MenuConfig = {
                version: '1.0',
                menu: [{ label: 'First', type: 'terminal', command: 'test1' }]
            };

            // 編集前の状態を保存
            editor.pushHistory(config1);

            // undoで保存した状態に戻る
            const result = editor.undo();

            assert.ok(result);
            assert.strictEqual(result?.menu[0].label, 'First');
        });

        test('redo - Undo後に元に戻れる', () => {
            const config1: MenuConfig = {
                version: '1.0',
                menu: [{ label: 'First', type: 'terminal', command: 'test1' }]
            };
            const config2: MenuConfig = {
                version: '1.0',
                menu: [{ label: 'Second', type: 'terminal', command: 'test2' }]
            };

            // 状態1を保存してundoで取り出し
            editor.pushHistory(config1);
            const undone = editor.undo();

            // undoした状態をredoスタックに保存
            editor.pushRedo(config2);

            // redoで次の状態に進む
            const result = editor.redo();

            assert.ok(result);
            assert.strictEqual(result?.menu[0].label, 'Second');
        });
    });
});
