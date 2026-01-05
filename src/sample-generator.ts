/**
 * TaskPilot Sample Generator
 * サンプル設定ファイル生成機能
 */

import * as vscode from 'vscode';

/**
 * サンプルテンプレートの種類
 */
export interface SampleTemplate {
    /** テンプレートID */
    id: string;
    /** 表示ラベル */
    label: string;
    /** 説明 */
    description: string;
    /** テンプレート内容 */
    content: string;
}

/**
 * 最小構成テンプレート
 * 基本的な構造のみ、10行程度
 */
const minimalTemplate = `# TaskPilot - 最小構成サンプル
# 基本的なメニュー構成の例

version: "1.0"

menu:
  - label: Build
    icon: "$(package)"
    type: terminal
    command: npm run build

  - label: Test
    icon: "$(beaker)"
    type: terminal
    command: npm test
`;

/**
 * 標準構成テンプレート
 * ref, children を含む、50行程度
 */
const standardTemplate = `# TaskPilot - 標準構成サンプル
# ref（参照）とchildren（子メニュー）の使用例

version: "1.0"

# 再利用可能なコマンド定義
# 複数の場所で同じコマンドを使いたい場合に便利
commands:
  build:
    type: terminal
    command: npm run build
    description: プロジェクトをビルド
  test:
    type: terminal
    command: npm test
    description: テストを実行
  lint:
    type: terminal
    command: npm run lint
    description: Lintチェック

# メニュー構成
menu:
  # 子メニューを持つカテゴリ
  - label: Development
    icon: "$(tools)"
    description: 開発用コマンド
    children:
      # ref で commands を参照
      - label: Build
        icon: "$(package)"
        ref: build
      - label: Test
        icon: "$(beaker)"
        ref: test
      - label: Lint
        icon: "$(checklist)"
        ref: lint
      # インラインでコマンドを定義
      - label: Watch
        icon: "$(eye)"
        type: terminal
        command: npm run watch

  # Git操作
  - label: Git
    icon: "$(git-branch)"
    children:
      - label: Status
        icon: "$(info)"
        type: terminal
        command: git status
      - label: Pull
        icon: "$(cloud-download)"
        type: terminal
        command: git pull
      - label: Push
        icon: "$(cloud-upload)"
        type: terminal
        command: git push

  # VS Codeコマンドの実行例
  - label: Settings
    icon: "$(gear)"
    type: vscodeCommand
    command: workbench.action.openSettings
`;

/**
 * フル機能テンプレート
 * parallel, actions, continueOnError など全機能
 */
const advancedTemplate = `# TaskPilot - フル機能サンプル
# 全機能のデモ: parallel（並列実行）, actions（順次実行）, ref など

version: "1.0"

# 再利用可能なコマンド定義
commands:
  build:
    type: terminal
    command: npm run build
    description: プロジェクトをビルド
  test:
    type: terminal
    command: npm test
    description: テストを実行
  lint:
    type: terminal
    command: npm run lint
    description: Lintチェック
  start:
    type: terminal
    command: npm start
    description: 開発サーバー起動
    terminal: server  # 専用ターミナル

menu:
  # 開発用コマンド（子メニュー）
  - label: Development
    icon: "$(tools)"
    description: 開発用コマンド
    children:
      - label: Build
        icon: "$(package)"
        ref: build
      - label: Test
        icon: "$(beaker)"
        ref: test
      - label: Lint
        icon: "$(checklist)"
        ref: lint

  # 順次実行（actions）の例
  # 複数のコマンドを順番に実行
  - label: CI Pipeline
    icon: "$(rocket)"
    description: Lint → Test → Build を順番に実行
    actions:
      - ref: lint
      - ref: test
      - ref: build
    # エラーが発生しても続行する場合は以下を追加
    # continueOnError: true

  # 並列実行（parallel）の例
  # ターミナルを分割して同時実行
  - label: Dev Environment
    icon: "$(split-horizontal)"
    description: サーバーとウォッチを並列起動
    parallel:
      - type: terminal
        command: npm run watch
        terminal: watch
        description: ファイル変更を監視
      - ref: start

  # ネストした子メニューの例
  - label: Git
    icon: "$(git-branch)"
    children:
      - label: Basic
        icon: "$(versions)"
        children:
          - label: Status
            icon: "$(info)"
            type: terminal
            command: git status
          - label: Log
            icon: "$(history)"
            type: terminal
            command: git log --oneline -10
      - label: Sync
        icon: "$(sync)"
        children:
          - label: Pull
            icon: "$(cloud-download)"
            type: terminal
            command: git pull
          - label: Push
            icon: "$(cloud-upload)"
            type: terminal
            command: git push

  # VS Codeコマンドの例
  - label: Editor
    icon: "$(window)"
    children:
      - label: Settings
        icon: "$(gear)"
        type: vscodeCommand
        command: workbench.action.openSettings
      - label: Keyboard Shortcuts
        icon: "$(keyboard)"
        type: vscodeCommand
        command: workbench.action.openGlobalKeybindings
      - label: Extensions
        icon: "$(extensions)"
        type: vscodeCommand
        command: workbench.extensions.action.showInstalledExtensions

  # 作業ディレクトリ（cwd）の指定例
  - label: Subproject
    icon: "$(folder)"
    description: サブディレクトリで実行
    type: terminal
    command: npm install
    cwd: ./packages/subproject
`;

/**
 * 利用可能なサンプルテンプレート一覧
 */
export const sampleTemplates: SampleTemplate[] = [
    {
        id: 'minimal',
        label: '$(file) 最小構成（Minimal）',
        description: '10行程度 - 基本だけ',
        content: minimalTemplate
    },
    {
        id: 'standard',
        label: '$(list-tree) 標準構成（Standard）',
        description: '50行程度 - ref/children含む',
        content: standardTemplate
    },
    {
        id: 'advanced',
        label: '$(rocket) フル機能（Advanced）',
        description: 'parallel/actions含む全機能デモ',
        content: advancedTemplate
    }
];

/**
 * サンプル設定ファイルを生成
 * @param configPath 設定ファイルのパス
 */
export async function generateSampleConfig(configPath: string): Promise<void> {
    // テンプレート選択
    const selected = await vscode.window.showQuickPick(
        sampleTemplates.map(t => ({
            label: t.label,
            description: t.description,
            template: t
        })),
        {
            placeHolder: 'サンプルテンプレートを選択してください',
            title: 'TaskPilot: サンプル設定を生成'
        }
    );

    if (!selected) {
        return; // キャンセル
    }

    // ファイルが既に存在するか確認
    const uri = vscode.Uri.file(configPath);
    let fileExists = false;
    try {
        await vscode.workspace.fs.stat(uri);
        fileExists = true;
    } catch {
        // ファイルが存在しない
    }

    if (fileExists) {
        const overwrite = await vscode.window.showWarningMessage(
            `${configPath} は既に存在します。上書きしますか？`,
            { modal: true },
            '上書き'
        );
        if (overwrite !== '上書き') {
            return;
        }
    }

    // ファイル生成
    try {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(selected.template.content, 'utf-8'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`TaskPilot: ${selected.template.label.replace(/\$\([^)]+\)\s*/, '')}サンプルを生成しました`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`TaskPilot: サンプル生成に失敗しました: ${message}`);
    }
}

/**
 * テンプレートIDからテンプレートを取得
 * @param id テンプレートID
 */
export function getTemplateById(id: string): SampleTemplate | undefined {
    return sampleTemplates.find(t => t.id === id);
}
