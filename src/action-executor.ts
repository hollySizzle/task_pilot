/**
 * TaskPilot Action Executor
 * terminal, vscodeCommand, task の3種類のアクションを実行
 */

import * as vscode from 'vscode';
import { ResolvedAction } from './types';

/**
 * ActionExecutor - アクション実行クラス
 */
export class ActionExecutor implements vscode.Disposable {
    /** 管理中のターミナル (名前 -> Terminal) */
    private terminals: Map<string, vscode.Terminal> = new Map();

    /** ターミナル終了監視用Disposable */
    private terminalCloseListener: vscode.Disposable;

    constructor() {
        // ターミナルが閉じられたらマップから削除
        this.terminalCloseListener = vscode.window.onDidCloseTerminal(terminal => {
            for (const [name, t] of this.terminals) {
                if (t === terminal) {
                    this.terminals.delete(name);
                    break;
                }
            }
        });
    }

    /**
     * アクションを実行
     */
    async execute(action: ResolvedAction): Promise<void> {
        if (!action.command) {
            throw new Error('Action command is required');
        }

        switch (action.type) {
            case 'terminal':
                await this.executeTerminal(action);
                break;
            case 'vscodeCommand':
                await this.executeVscodeCommand(action);
                break;
            case 'task':
                await this.executeTask(action);
                break;
            default:
                throw new Error(`Unknown action type: ${(action as { type: string }).type}`);
        }
    }

    /**
     * ターミナルでコマンドを実行
     */
    private async executeTerminal(action: ResolvedAction): Promise<void> {
        const terminalName = action.terminal || 'TaskPilot';

        // 既存のターミナルを探す
        let terminal = this.terminals.get(terminalName);

        // 既存ターミナルがなければ新規作成
        if (!terminal) {
            // vscode.window.terminalsから同名のものを探す
            terminal = vscode.window.terminals.find(t => t.name === terminalName);

            if (!terminal) {
                // 新規作成
                const options: vscode.TerminalOptions = {
                    name: terminalName
                };

                if (action.cwd) {
                    options.cwd = action.cwd;
                }

                terminal = vscode.window.createTerminal(options);
            }

            this.terminals.set(terminalName, terminal);
        }

        // ターミナルを表示
        terminal.show(true);

        // コマンドを送信
        terminal.sendText(action.command);
    }

    /**
     * VS Codeコマンドを実行
     */
    private async executeVscodeCommand(action: ResolvedAction): Promise<void> {
        const args = action.args || [];

        try {
            await vscode.commands.executeCommand(action.command, ...args);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to execute command "${action.command}": ${message}`);
        }
    }

    /**
     * タスクを実行
     */
    private async executeTask(action: ResolvedAction): Promise<void> {
        // 利用可能なタスクを取得
        const tasks = await vscode.tasks.fetchTasks();

        // 名前でタスクを検索
        const task = tasks.find(t => t.name === action.command);

        if (!task) {
            // タスクが見つからない場合、利用可能なタスク名を表示
            const taskNames = tasks.map(t => t.name).join(', ');
            throw new Error(
                `Task "${action.command}" not found. Available tasks: ${taskNames || 'none'}`
            );
        }

        // タスクを実行
        await vscode.tasks.executeTask(task);
    }

    /**
     * リソースを解放
     */
    dispose(): void {
        this.terminalCloseListener.dispose();
        // ターミナルは明示的に閉じない（ユーザーが作業中かもしれない）
        this.terminals.clear();
    }
}
