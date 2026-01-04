/**
 * TaskPilot Config Editor
 * 設定ファイルをGUIで編集するための機能
 */

import * as vscode from 'vscode';
import { MenuConfig, MenuItem, CommandDefinition } from './types';

/**
 * Webviewとのメッセージ型
 */
export interface EditorMessage {
    type: 'add' | 'update' | 'delete' | 'move' | 'save' | 'undo' | 'redo';
    path?: number[];
    targetPath?: number[];
    item?: MenuItem;
    commandName?: string;
    command?: CommandDefinition;
}

/**
 * メニューアイテム編集情報
 */
export interface MenuItemEdit {
    path: number[];
    item: MenuItem;
}

/**
 * ConfigEditor - 設定編集機能クラス
 */
export class ConfigEditor implements vscode.Disposable {
    /** Undo履歴 */
    private undoStack: MenuConfig[] = [];
    /** Redo履歴 */
    private redoStack: MenuConfig[] = [];
    /** 最大履歴数 */
    private readonly maxHistorySize = 50;

    /**
     * メニューアイテムを追加
     * @param config 現在の設定
     * @param item 追加するアイテム
     * @param insertPath 挿入位置のパス（省略時は末尾に追加）
     * @returns 更新された設定
     */
    addMenuItem(config: MenuConfig, item: MenuItem, insertPath?: number[]): MenuConfig {
        const newConfig = this.deepClone(config);

        if (!insertPath || insertPath.length === 0) {
            // ルートの末尾に追加
            newConfig.menu.push(item);
        } else if (insertPath.length === 1) {
            // ルートの特定位置に挿入
            newConfig.menu.splice(insertPath[0], 0, item);
        } else {
            // ネストした位置に挿入
            const parentPath = insertPath.slice(0, -1);
            const insertIndex = insertPath[insertPath.length - 1];
            const parent = this.getItemAtPath(newConfig.menu, parentPath);

            if (parent && parent.children) {
                parent.children.splice(insertIndex, 0, item);
            } else if (parent) {
                parent.children = [item];
            }
        }

        return newConfig;
    }

    /**
     * メニューアイテムを更新
     * @param config 現在の設定
     * @param path 更新対象のパス
     * @param item 新しいアイテム
     * @returns 更新された設定
     */
    updateMenuItem(config: MenuConfig, path: number[], item: MenuItem): MenuConfig {
        const newConfig = this.deepClone(config);

        if (path.length === 1) {
            newConfig.menu[path[0]] = item;
        } else {
            const parentPath = path.slice(0, -1);
            const index = path[path.length - 1];
            const parent = this.getItemAtPath(newConfig.menu, parentPath);

            if (parent?.children) {
                parent.children[index] = item;
            }
        }

        return newConfig;
    }

    /**
     * メニューアイテムを削除
     * @param config 現在の設定
     * @param path 削除対象のパス
     * @returns 更新された設定
     */
    deleteMenuItem(config: MenuConfig, path: number[]): MenuConfig {
        const newConfig = this.deepClone(config);

        if (path.length === 1) {
            newConfig.menu.splice(path[0], 1);
        } else {
            const parentPath = path.slice(0, -1);
            const index = path[path.length - 1];
            const parent = this.getItemAtPath(newConfig.menu, parentPath);

            if (parent?.children) {
                parent.children.splice(index, 1);
            }
        }

        return newConfig;
    }

    /**
     * メニューアイテムを移動
     * @param config 現在の設定
     * @param fromPath 移動元のパス
     * @param toPath 移動先のパス（削除後の配列でのインデックス）
     * @returns 更新された設定
     */
    moveMenuItem(config: MenuConfig, fromPath: number[], toPath: number[]): MenuConfig {
        const newConfig = this.deepClone(config);

        // 移動元のアイテムを取得（削除前に）
        const item = this.deepClone(this.getItemAtPath(newConfig.menu, fromPath));
        if (!item) {
            return newConfig;
        }

        // 移動元から削除
        if (fromPath.length === 1) {
            newConfig.menu.splice(fromPath[0], 1);
        } else {
            const parentPath = fromPath.slice(0, -1);
            const index = fromPath[fromPath.length - 1];
            const parent = this.getItemAtPath(newConfig.menu, parentPath);
            if (parent?.children) {
                parent.children.splice(index, 1);
            }
        }

        // 移動先に挿入（toPathは削除後の配列でのインデックス）
        if (toPath.length === 1) {
            newConfig.menu.splice(toPath[0], 0, item);
        } else {
            const parentPath = toPath.slice(0, -1);
            const insertIndex = toPath[toPath.length - 1];
            const parent = this.getItemAtPath(newConfig.menu, parentPath);

            if (parent) {
                if (!parent.children) {
                    parent.children = [];
                }
                parent.children.splice(insertIndex, 0, item);
            }
        }

        return newConfig;
    }

    /**
     * コマンドを追加
     */
    addCommand(config: MenuConfig, name: string, command: CommandDefinition): MenuConfig {
        const newConfig = this.deepClone(config);

        if (!newConfig.commands) {
            newConfig.commands = {};
        }

        newConfig.commands[name] = command;

        return newConfig;
    }

    /**
     * コマンドを更新
     */
    updateCommand(config: MenuConfig, name: string, command: CommandDefinition): MenuConfig {
        const newConfig = this.deepClone(config);

        if (newConfig.commands) {
            newConfig.commands[name] = command;
        }

        return newConfig;
    }

    /**
     * コマンドを削除
     */
    deleteCommand(config: MenuConfig, name: string): MenuConfig {
        const newConfig = this.deepClone(config);

        if (newConfig.commands) {
            delete newConfig.commands[name];
        }

        return newConfig;
    }

    /**
     * コマンド名を変更（参照も更新）
     */
    renameCommand(config: MenuConfig, oldName: string, newName: string): MenuConfig {
        const newConfig = this.deepClone(config);

        if (newConfig.commands?.[oldName]) {
            // コマンドの移動
            newConfig.commands[newName] = newConfig.commands[oldName];
            delete newConfig.commands[oldName];

            // メニュー内のref参照を更新
            this.updateRefsInMenu(newConfig.menu, oldName, newName);
        }

        return newConfig;
    }

    /**
     * メニューアイテムのバリデーション
     * @param item 検証するアイテム
     * @returns エラーメッセージの配列
     */
    validateMenuItem(item: MenuItem): string[] {
        const errors: string[] = [];

        if (!item.label || item.label.trim() === '') {
            errors.push('label is required');
        }

        // childrenがある場合はアクション不要
        if (item.children && item.children.length > 0) {
            return errors;
        }

        // childrenがない場合はref, type+command, またはactionsが必要
        const hasRef = !!item.ref;
        const hasInlineAction = item.type && item.command;
        const hasActions = item.actions && item.actions.length > 0;

        if (!hasRef && !hasInlineAction && !hasActions) {
            errors.push('Menu item must have children, ref, type+command, or actions');
        }

        return errors;
    }

    /**
     * 履歴に追加
     */
    pushHistory(config: MenuConfig): void {
        this.undoStack.push(this.deepClone(config));

        // Redo履歴をクリア
        this.redoStack = [];

        // 履歴サイズ制限
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
    }

    /**
     * Undoが可能か
     */
    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * Redoが可能か
     */
    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /**
     * Undo実行
     * @returns 前の状態（なければnull）
     */
    undo(): MenuConfig | null {
        const state = this.undoStack.pop();
        if (state) {
            return state;
        }
        return null;
    }

    /**
     * Redo実行
     * @returns 次の状態（なければnull）
     */
    redo(): MenuConfig | null {
        const state = this.redoStack.pop();
        if (state) {
            return state;
        }
        return null;
    }

    /**
     * 現在の状態をRedoスタックに保存
     */
    pushRedo(config: MenuConfig): void {
        this.redoStack.push(this.deepClone(config));
    }

    /**
     * 履歴をクリア
     */
    clearHistory(): void {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * リソースの解放
     */
    dispose(): void {
        this.clearHistory();
    }

    /**
     * パスからアイテムを取得
     */
    private getItemAtPath(items: MenuItem[], path: number[]): MenuItem | null {
        if (path.length === 0 || !items) {
            return null;
        }

        const index = path[0];
        if (index < 0 || index >= items.length) {
            return null;
        }

        const item = items[index];

        if (path.length === 1) {
            return item;
        }

        if (item.children) {
            return this.getItemAtPath(item.children, path.slice(1));
        }

        return null;
    }

    /**
     * メニュー内のref参照を更新
     */
    private updateRefsInMenu(items: MenuItem[], oldRef: string, newRef: string): void {
        for (const item of items) {
            if (item.ref === oldRef) {
                item.ref = newRef;
            }

            if (item.actions) {
                for (const action of item.actions) {
                    if (action.ref === oldRef) {
                        action.ref = newRef;
                    }
                }
            }

            if (item.children) {
                this.updateRefsInMenu(item.children, oldRef, newRef);
            }
        }
    }

    /**
     * ディープクローン
     */
    private deepClone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj));
    }
}
