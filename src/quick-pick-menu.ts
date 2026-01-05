/**
 * TaskPilot Quick Pick Menu
 * 階層型メニューUIの実装
 */

import * as vscode from 'vscode';
import { MenuItem, ResolvedAction } from './types';
import { ConfigManager } from './config-manager';
import { ActionExecutor } from './action-executor';

/**
 * QuickPick用の拡張アイテム型
 */
export interface TaskQuickPickItem extends vscode.QuickPickItem {
    /** 元のメニューアイテム */
    menuItem: MenuItem;
    /** 戻るボタンかどうか */
    isBack?: boolean;
}

/**
 * QuickPickMenu - 階層型メニュー表示クラス
 */
export class QuickPickMenu {
    /**
     * QuickPickItemの配列を作成
     */
    static createQuickPickItems(menuItems: MenuItem[]): TaskQuickPickItem[] {
        return menuItems.map(item => ({
            label: this.formatLabel(item.label, item.icon),
            description: item.description,
            detail: item.children && item.children.length > 0 ? '→ submenu' : undefined,
            menuItem: item
        }));
    }

    /**
     * 戻るボタンを作成
     */
    static createBackItem(parentLabel?: string): TaskQuickPickItem {
        return {
            label: '$(arrow-left) Back',
            description: parentLabel ? `to ${parentLabel}` : undefined,
            menuItem: { label: 'Back' },
            isBack: true
        };
    }

    /**
     * アイテムがアクション実行可能か判定
     */
    static isActionableItem(item: MenuItem): boolean {
        // childrenがあるものはカテゴリ（アクション不可）
        if (item.children && item.children.length > 0) {
            return false;
        }
        // actions配列、parallel配列、refまたはtype+commandがあればアクション可能
        return !!(item.actions || item.parallel || item.ref || (item.type && item.command));
    }

    /**
     * ラベルをフォーマット（アイコン付き）
     */
    static formatLabel(label: string, icon?: string): string {
        if (icon) {
            return `${icon} ${label}`;
        }
        return label;
    }

    /**
     * メニューを表示（階層対応）
     */
    static async show(
        configManager: ConfigManager,
        actionExecutor: ActionExecutor,
        items?: MenuItem[],
        breadcrumb: string[] = []
    ): Promise<void> {
        const config = configManager.getConfig();
        if (!config && !items) {
            vscode.window.showWarningMessage('TaskPilot: No configuration loaded');
            return;
        }

        const menuItems = items || config!.menu;
        const quickPickItems: TaskQuickPickItem[] = [];

        // 戻るボタン（ルート以外）
        if (breadcrumb.length > 0) {
            quickPickItems.push(this.createBackItem(breadcrumb[breadcrumb.length - 1]));
        }

        // メニューアイテムを追加
        quickPickItems.push(...this.createQuickPickItems(menuItems));

        // QuickPickを表示
        const title = breadcrumb.length > 0
            ? `TaskPilot: ${breadcrumb.join(' > ')}`
            : 'TaskPilot';

        const selected = await vscode.window.showQuickPick(quickPickItems, {
            title,
            placeHolder: 'Select an action or category',
            matchOnDescription: true
        });

        if (!selected) {
            return; // ユーザーがキャンセル
        }

        // 戻るボタン
        if (selected.isBack) {
            breadcrumb.pop();
            const parentItems = this.getParentItems(config!.menu, breadcrumb);
            await this.show(configManager, actionExecutor, parentItems, breadcrumb.slice(0, -1));
            return;
        }

        const menuItem = selected.menuItem;

        // カテゴリの場合はサブメニューを表示
        if (menuItem.children && menuItem.children.length > 0) {
            await this.show(
                configManager,
                actionExecutor,
                menuItem.children,
                [...breadcrumb, menuItem.label]
            );
            return;
        }

        // 並列アクション実行
        if (configManager.hasParallelActions(menuItem)) {
            const parallelActions = configManager.resolveParallelActions(menuItem);
            if (parallelActions && parallelActions.length > 0) {
                try {
                    const terminals = await actionExecutor.executeParallel(parallelActions);
                    vscode.window.showInformationMessage(
                        `TaskPilot: Started ${terminals.length} parallel terminal(s)`
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    vscode.window.showErrorMessage(`TaskPilot: ${message}`);
                }
                return;
            }
        }

        // アクション実行
        const actions = configManager.resolveActions(menuItem);
        if (actions && actions.length > 0) {
            await this.executeActions(actionExecutor, actions, menuItem);
        }
    }

    /**
     * アクションを実行（単一/複数対応）
     */
    private static async executeActions(
        actionExecutor: ActionExecutor,
        actions: ResolvedAction[],
        menuItem: MenuItem
    ): Promise<void> {
        if (actions.length === 1) {
            // 単一アクション
            try {
                await actionExecutor.execute(actions[0]);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`TaskPilot: ${message}`);
            }
        } else {
            // 複数アクション - 進捗表示
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `TaskPilot: ${menuItem.label}`,
                cancellable: true
            }, async (progress, token) => {
                const result = await actionExecutor.executeMultiple(actions, {
                    continueOnError: menuItem.continueOnError ?? false,
                    cancellationToken: token,
                    onProgress: (current, total, action) => {
                        progress.report({
                            increment: 100 / total,
                            message: `(${current}/${total}) ${action.description || action.command}`
                        });
                    }
                });

                if (result.cancelled) {
                    vscode.window.showWarningMessage(`TaskPilot: Execution cancelled (${result.completedCount}/${result.totalCount} completed)`);
                } else if (!result.success) {
                    if (result.error) {
                        vscode.window.showErrorMessage(`TaskPilot: ${result.error.message} (at step ${(result.failedIndex ?? 0) + 1})`);
                    } else if (result.errors && result.errors.length > 0) {
                        vscode.window.showWarningMessage(`TaskPilot: Completed with ${result.errors.length} error(s)`);
                    }
                } else {
                    vscode.window.showInformationMessage(`TaskPilot: All ${result.totalCount} actions completed`);
                }
            });
        }
    }

    /**
     * breadcrumbに基づいて親のアイテムを取得
     */
    private static getParentItems(rootMenu: MenuItem[], breadcrumb: string[]): MenuItem[] {
        let current = rootMenu;

        for (const label of breadcrumb) {
            const found = current.find(item => item.label === label);
            if (found?.children) {
                current = found.children;
            }
        }

        return current;
    }
}
