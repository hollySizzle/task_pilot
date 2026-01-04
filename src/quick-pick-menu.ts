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
        // refまたはtype+commandがあればアクション可能
        return !!(item.ref || (item.type && item.command));
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

        // アクション実行
        const action = configManager.resolveAction(menuItem);
        if (action) {
            try {
                await actionExecutor.execute(action);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`TaskPilot: ${message}`);
            }
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
