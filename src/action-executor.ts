/**
 * TaskPilot Action Executor
 * terminal, shellCommand, vscodeCommand, task などのアクションを実行
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { exec } from 'child_process';
import { ResolvedAction, MultipleActionOptions, MultipleActionResult, ActionError, ActionGroup } from './types';

/**
 * ActionExecutor - アクション実行クラス
 */
export class ActionExecutor implements vscode.Disposable {
    /**
     * 1 行でそのまま投入して安全な command の最大 byte 数。
     * tty の canonical 入力キュー (MAX_INPUT / MAX_CANON = 1024 byte) を超える
     * 1 行入力は超過分が tty 側で破棄される。これを超える command は temp ファイル
     * 経由 (`source <file>`) で投入し、1024 byte 行制限を構造的に回避する。
     * margin を取り 1024 より小さい値にしている。
     */
    private static readonly TERMINAL_SEND_DIRECT_MAX_BYTES = 1000;

    /** fallback (paced chunk 送信) 用の chunk サイズ */
    private static readonly TERMINAL_SEND_CHUNK_SIZE_BYTES = 512;

    /** fallback (paced chunk 送信) で各 chunk 後に挟む待機時間 (ms) */
    private static readonly TERMINAL_SEND_CHUNK_DELAY_MS = 10;

    /** 管理中のターミナル (名前 -> Terminal) */
    private terminals: Map<string, vscode.Terminal> = new Map();

    /** ターミナル終了監視用Disposable */
    private terminalCloseListener: vscode.Disposable;

    /** shellCommand の stdout/stderr 出力先 */
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TaskPilot');

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
            case 'shellCommand':
            case 'vscodeCommand':
            case 'task':
                if (!action.command) {
                    throw new Error('Action command is required');
                }
                break;
            case 'openInDevContainer':
            case 'openRemoteSSH':
            case 'openRemoteTunnel':
                if (!action.path) {
                    throw new Error('Action path is required');
                }
                break;
        }

        switch (action.type) {
            case 'terminal':
                await this.executeTerminal(action);
                break;
            case 'shellCommand':
                await this.executeShellCommand(action);
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
            case 'openRemoteTunnel':
                await this.executeOpenRemoteTunnel(action);
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
        await this.sendTerminalCommand(terminal, action.command!);
    }

    /**
     * 拡張ホスト側でシェルコマンドを実行し、完了まで待機
     */
    private async executeShellCommand(action: ResolvedAction): Promise<void> {
        const command = action.command!;
        const cwd = this.resolveCwd(action.cwd);

        this.outputChannel.appendLine(`$ ${command}`);
        this.outputChannel.appendLine(`cwd: ${cwd}`);

        await new Promise<void>((resolve, reject) => {
            exec(command, {
                cwd,
                env: process.env,
                maxBuffer: 10 * 1024 * 1024
            }, (error, stdout, stderr) => {
                if (stdout) {
                    this.outputChannel.append(stdout);
                    if (!stdout.endsWith('\n')) {
                        this.outputChannel.appendLine('');
                    }
                }

                if (stderr) {
                    this.outputChannel.append(stderr);
                    if (!stderr.endsWith('\n')) {
                        this.outputChannel.appendLine('');
                    }
                }

                if (error) {
                    const detail = this.getShellCommandFailureDetail(stdout, stderr, error.message);
                    reject(new Error(`Shell command failed: ${detail}`));
                    return;
                }

                resolve();
            });
        });
    }

    /**
     * shellCommand 失敗時の表示メッセージを整形
     * stderr / stdout の最後の非空行を優先し、汎用的な exec エラー文字列より
     * 具体的な失敗理由をユーザーへ返す
     */
    private getShellCommandFailureDetail(stdout: string, stderr: string, fallback: string): string {
        const stderrLine = this.getLastNonEmptyLine(stderr);
        if (stderrLine) {
            return stderrLine;
        }

        const stdoutLine = this.getLastNonEmptyLine(stdout);
        if (stdoutLine) {
            return stdoutLine;
        }

        return fallback;
    }

    private getLastNonEmptyLine(output: string): string | null {
        const lines = output
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

        return lines.length > 0 ? lines[lines.length - 1] : null;
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
     * cwd を workspace ルート基準で解決する
     */
    private resolveCwd(cwd?: string): string {
        if (!cwd) {
            return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        }

        if (path.isAbsolute(cwd)) {
            return cwd;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        return path.resolve(workspaceRoot, cwd);
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
     * Remote Tunnelでフォルダを開く
     */
    private async executeOpenRemoteTunnel(action: ResolvedAction): Promise<void> {
        if (!action.path) {
            throw new Error('Path is required for openRemoteTunnel');
        }
        if (!action.tunnelName) {
            throw new Error('TunnelName is required for openRemoteTunnel');
        }

        try {
            // vscode-remote://tunnel+{tunnelName}{path} 形式のURIを作成
            const remoteUri = vscode.Uri.parse(`vscode-remote://tunnel+${action.tunnelName}${action.path}`);
            await vscode.commands.executeCommand('vscode.openFolder', remoteUri);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to open folder via Remote Tunnel: ${message}`);
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
        await this.sendTerminalCommand(terminal, combinedCommand);
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
                await this.sendTerminalCommand(terminal, action.command);
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
        this.outputChannel.dispose();
        // ターミナルは明示的に閉じない（ユーザーが作業中かもしれない）
        this.terminals.clear();
    }

    /**
     * ターミナルへ command を投入する。
     *
     * 根本原因: tty の canonical 入力キュー (MAX_INPUT / MAX_CANON = 1024 byte)
     * を超える 1 行入力は tty 側で超過分が破棄され、長い command が約 1024 byte で
     * 途中切断される。chunk 分割や送信 timing 調整では tty 行制限そのものは回避できない。
     *
     * 対策:
     * - 短い command (<= TERMINAL_SEND_DIRECT_MAX_BYTES): そのまま 1 行で送る
     *   (端末履歴に可読な形で残る)。
     * - 長い command (POSIX shell): temp ファイルへ全文を書き出し、`source <file>` の
     *   短い 1 行だけ送る。投入される 1 行が tty 行制限内に収まり、command 全体が
     *   欠落なく実行される。
     *
     * cross-platform 注意:
     * tty の MAX_CANON 行制限は Unix tty 固有であり、Windows の ConPTY には当てはまらない。
     * また `source` / `rm` は POSIX shell 構文で PowerShell / cmd.exe では動かない。
     * そのため temp ファイル方式は POSIX (darwin / linux) のみに限定し、Windows では
     * 従来同様の paced chunk 送信に fallback して既存の cross-platform 動作を壊さない。
     * Windows / PowerShell 向けの長尺 command 対応が必要なら follow-up issue で扱う。
     */
    private async sendTerminalCommand(terminal: vscode.Terminal, command: string): Promise<void> {
        if (Buffer.byteLength(command, 'utf8') <= ActionExecutor.TERMINAL_SEND_DIRECT_MAX_BYTES) {
            terminal.sendText(command, true);
            return;
        }

        // POSIX shell 前提の temp ファイル方式は Unix 系のみ。Windows は chunk 送信。
        if (process.platform !== 'win32') {
            try {
                await this.sendViaTempFile(terminal, command);
                return;
            } catch {
                // temp ファイル作成に失敗した場合 (read-only tmp 等) は
                // best-effort の paced chunk 送信に fallback する。
            }
        }

        await this.sendChunked(terminal, command);
    }

    /**
     * 長い command を temp ファイル経由で投入する (POSIX shell 専用)。
     * tty の 1024 byte 行制限を回避するため command 全文を一時ファイルへ書き出し、
     * `source <file>` の短い 1 行だけ端末へ送る。実行後は temp directory を削除する。
     *
     * security: world-writable な `os.tmpdir()` 直下に予測可能名のファイルを作ると
     * symlink / race で意図しないファイルへ書き込む余地がある。これを避けるため
     * `mkdtemp` で専用の 0700 directory を作り、その中へ排他的 (`wx`) に書き出す。
     */
    private async sendViaTempFile(terminal: vscode.Terminal, command: string): Promise<void> {
        const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'taskpilot-'));
        const file = path.join(dir, 'command.sh');

        // `wx` で排他的作成 (既存 path があれば失敗)。dir は専用 0700 なので衝突しない。
        await fs.promises.writeFile(file, `${command}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

        const quotedFile = this.quoteForShell(file);
        const quotedDir = this.quoteForShell(dir);
        // command の成否に依らず temp directory (file 含む) を必ず削除する (`;` で連結)。
        terminal.sendText(`source ${quotedFile}; rm -rf ${quotedDir}`, true);
    }

    /**
     * paced chunk 送信 (temp ファイル fallback 用)。
     * 各 chunk 後に短い delay を挟み、tty 入力キューを drain させてから次を送る。
     */
    private async sendChunked(terminal: vscode.Terminal, command: string): Promise<void> {
        const chunks = this.splitTerminalText(command, ActionExecutor.TERMINAL_SEND_CHUNK_SIZE_BYTES);

        for (const chunk of chunks) {
            terminal.sendText(chunk, false);
            await this.delay(ActionExecutor.TERMINAL_SEND_CHUNK_DELAY_MS);
        }

        terminal.sendText('', true);
    }

    /**
     * POSIX シェル向けに値を single-quote で囲んでエスケープする。
     */
    private quoteForShell(value: string): string {
        return `'${value.replace(/'/g, "'\\''")}'`;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private splitTerminalText(text: string, maxBytes: number): string[] {
        const chunks: string[] = [];
        let current = '';
        let currentBytes = 0;

        for (const char of text) {
            const charBytes = Buffer.byteLength(char, 'utf8');

            if (current && currentBytes + charBytes > maxBytes) {
                chunks.push(current);
                current = '';
                currentBytes = 0;
            }

            current += char;
            currentBytes += charBytes;
        }

        if (current) {
            chunks.push(current);
        }

        return chunks;
    }
}
