/**
 * TaskPilot Action Executor
 * terminal, vscodeCommand, task の3種類のアクションを実行
 */

import * as vscode from 'vscode';
import { ResolvedAction, MultipleActionOptions, MultipleActionResult, ActionError, ActionGroup } from './types';

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
        switch (action.type) {
            case 'terminal':
            case 'vscodeCommand':
            case 'task':
                if (!action.command) {
                    throw new Error('Action command is required');
                }
                break;
            case 'openInDevContainer':
            case 'openRemoteSSH':
                if (!action.path) {
                    throw new Error('Action path is required');
                }
                break;
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
            case 'openInDevContainer':
                await this.executeOpenInDevContainer(action);
                break;
            case 'openRemoteSSH':
                await this.executeOpenRemoteSSH(action);
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
        terminal.sendText(action.command!);
    }

    /**
     * VS Codeコマンドを実行
     */
    private async executeVscodeCommand(action: ResolvedAction): Promise<void> {
        const args = action.args || [];

        try {
            await vscode.commands.executeCommand(action.command!, ...args);
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
     * DevContainerでフォルダを開く
     */
    private async executeOpenInDevContainer(action: ResolvedAction): Promise<void> {
        if (!action.path) {
            throw new Error('Path is required for openInDevContainer');
        }

        try {
            const folderUri = vscode.Uri.file(action.path);
            await vscode.commands.executeCommand('remote-containers.openFolder', folderUri);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to open folder in DevContainer: ${message}`);
        }
    }

    /**
     * Remote-SSHでフォルダを開く
     */
    private async executeOpenRemoteSSH(action: ResolvedAction): Promise<void> {
        if (!action.path) {
            throw new Error('Path is required for openRemoteSSH');
        }
        if (!action.host) {
            throw new Error('Host is required for openRemoteSSH');
        }

        try {
            // vscode-remote://ssh-remote+{host}{path} 形式のURIを作成
            const remoteUri = vscode.Uri.parse(`vscode-remote://ssh-remote+${action.host}${action.path}`);
            await vscode.commands.executeCommand('vscode.openFolder', remoteUri);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to open folder via SSH: ${message}`);
        }
    }

    /**
     * 複数アクションを順次実行
     */
    async executeMultiple(
        actions: ResolvedAction[],
        options: MultipleActionOptions = {}
    ): Promise<MultipleActionResult> {
        const { continueOnError = false, cancellationToken, onProgress } = options;
        const totalCount = actions.length;
        let completedCount = 0;
        const errors: ActionError[] = [];

        // 空の配列の場合
        if (totalCount === 0) {
            return { success: true, completedCount: 0, totalCount: 0 };
        }

        // ターミナルアクションをグループ化して実行
        const groups = this.groupTerminalActions(actions);

        for (const group of groups) {
            // キャンセルチェック
            if (cancellationToken?.isCancellationRequested) {
                return {
                    success: false,
                    completedCount,
                    totalCount,
                    cancelled: true
                };
            }

            try {
                if (group.type === 'terminal-group') {
                    // 同一ターミナルへの連続コマンドをまとめて実行
                    await this.executeTerminalGroup(group.actions, group.terminalName);

                    // グループ内の全アクションを完了としてカウント
                    for (const action of group.actions) {
                        completedCount++;
                        if (onProgress) {
                            onProgress(completedCount, totalCount, action);
                        }
                    }
                } else {
                    // 通常のアクションを実行
                    await this.execute(group.action);
                    completedCount++;

                    if (onProgress) {
                        onProgress(completedCount, totalCount, group.action);
                    }
                }
            } catch (error) {
                const actionError: ActionError = {
                    index: group.startIndex,
                    action: group.type === 'terminal-group' ? group.actions[0] : group.action,
                    error: error instanceof Error ? error : new Error(String(error))
                };

                if (continueOnError) {
                    // エラーを記録して続行
                    errors.push(actionError);
                    // グループの場合は全アクションを完了扱い
                    if (group.type === 'terminal-group') {
                        completedCount += group.actions.length;
                    }
                } else {
                    // 中断
                    return {
                        success: false,
                        completedCount,
                        totalCount,
                        error: actionError.error,
                        failedIndex: group.startIndex
                    };
                }
            }
        }

        return {
            success: errors.length === 0,
            completedCount,
            totalCount,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    /**
     * アクションをターミナルグループごとにまとめる
     */
    private groupTerminalActions(actions: ResolvedAction[]): ActionGroup[] {
        const groups: ActionGroup[] = [];
        let i = 0;

        while (i < actions.length) {
            const action = actions[i];

            if (action.type === 'terminal') {
                // 同一ターミナルへの連続するターミナルアクションを収集
                const terminalName = action.terminal || 'TaskPilot';
                const terminalActions: ResolvedAction[] = [action];
                const startIndex = i;
                i++;

                while (i < actions.length) {
                    const nextAction = actions[i];
                    if (nextAction.type === 'terminal' &&
                        (nextAction.terminal || 'TaskPilot') === terminalName) {
                        terminalActions.push(nextAction);
                        i++;
                    } else {
                        break;
                    }
                }

                if (terminalActions.length > 1) {
                    // 複数のターミナルアクションをグループ化
                    groups.push({
                        type: 'terminal-group',
                        actions: terminalActions,
                        terminalName,
                        startIndex
                    });
                } else {
                    // 単一アクションはそのまま
                    groups.push({
                        type: 'single',
                        action: action,
                        startIndex
                    });
                }
            } else {
                // ターミナル以外のアクション
                groups.push({
                    type: 'single',
                    action: action,
                    startIndex: i
                });
                i++;
            }
        }

        return groups;
    }

    /**
     * 同一ターミナルへの複数コマンドをまとめて実行
     */
    private async executeTerminalGroup(actions: ResolvedAction[], terminalName: string): Promise<void> {
        // 既存のターミナルを探す
        let terminal = this.terminals.get(terminalName);

        // 既存ターミナルがなければ新規作成
        if (!terminal) {
            terminal = vscode.window.terminals.find(t => t.name === terminalName);

            if (!terminal) {
                // 新規作成（最初のアクションのcwdを使用）
                const options: vscode.TerminalOptions = {
                    name: terminalName
                };

                if (actions[0].cwd) {
                    options.cwd = actions[0].cwd;
                }

                terminal = vscode.window.createTerminal(options);
            }

            this.terminals.set(terminalName, terminal);
        }

        // ターミナルを表示
        terminal.show(true);

        // コマンドを && で結合して送信
        const combinedCommand = actions.map(a => a.command).join(' && ');
        terminal.sendText(combinedCommand);
    }

    /**
     * 並列アクションを分割ターミナルで実行
     * @param actions 実行するアクションの配列
     * @returns 作成されたターミナルの配列
     */
    async executeParallel(actions: ResolvedAction[]): Promise<vscode.Terminal[]> {
        if (actions.length === 0) {
            return [];
        }

        const createdTerminals: vscode.Terminal[] = [];
        let parentTerminal: vscode.Terminal | undefined;

        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            const terminalName = action.terminal || `TaskPilot-${i + 1}`;

            // ターミナルオプション
            const options: vscode.TerminalOptions = {
                name: terminalName
            };

            if (action.cwd) {
                options.cwd = action.cwd;
            }

            // 最初のターミナルは通常作成、2つ目以降は分割
            let terminal: vscode.Terminal;
            if (i === 0) {
                terminal = vscode.window.createTerminal(options);
                parentTerminal = terminal;
            } else {
                // TerminalSplitLocationOptions を使用して分割
                terminal = vscode.window.createTerminal({
                    ...options,
                    location: { parentTerminal: parentTerminal! }
                });
            }

            this.terminals.set(terminalName, terminal);
            createdTerminals.push(terminal);

            // ターミナルアクションのみコマンドを送信
            if (action.type === 'terminal' && action.command) {
                terminal.sendText(action.command);
            }
        }

        // 最初のターミナルを表示（分割されたターミナルも一緒に表示される）
        if (createdTerminals.length > 0) {
            createdTerminals[0].show(true);
        }

        return createdTerminals;
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
