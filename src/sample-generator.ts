/**
 * TaskPilot Sample Generator
 *
 * サンプル設定ファイル生成機能。
 * SSoT（Single Source of Truth）から自動生成されたサンプルYAMLを読み込みます。
 *
 * サンプルファイルは `npm run generate:samples` で生成されます。
 * 元データ: src/types.ts → schemas/taskpilot.schema.json → schemas/samples/*.yaml
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
 * テンプレート定義（メタ情報）
 */
interface TemplateDefinition {
    id: string;
    label: string;
    description: string;
    filename: string;
}

/**
 * 利用可能なテンプレートのメタ情報
 */
const templateDefinitions: TemplateDefinition[] = [
    {
        id: 'minimal',
        label: '$(file) 最小構成（Minimal）',
        description: '10行程度 - 基本だけ',
        filename: 'minimal.yaml'
    },
    {
        id: 'standard',
        label: '$(list-tree) 標準構成（Standard）',
        description: '50行程度 - ref/children含む',
        filename: 'standard.yaml'
    },
    {
        id: 'advanced',
        label: '$(rocket) フル機能（Advanced）',
        description: 'parallel/actions含む全機能デモ',
        filename: 'advanced.yaml'
    }
];

/**
 * 拡張のルートパスを保持（extension.tsで設定される）
 */
let extensionPath: string | undefined;

/**
 * 拡張パスを設定
 * @param extPath 拡張のルートパス
 */
export function setExtensionPath(extPath: string): void {
    extensionPath = extPath;
}

/**
 * サンプルファイルを読み込む
 * @param filename ファイル名
 */
function loadSampleFile(filename: string): string | undefined {
    if (!extensionPath) {
        console.error('Extension path not set');
        return undefined;
    }

    const samplePath = path.join(extensionPath, 'schemas', 'samples', filename);
    try {
        return fs.readFileSync(samplePath, 'utf-8');
    } catch {
        console.error(`Failed to load sample file: ${samplePath}`);
        return undefined;
    }
}

/**
 * サンプルテンプレート一覧を取得
 * SSoT生成されたYAMLファイルから動的に読み込み
 */
export function getSampleTemplates(): SampleTemplate[] {
    return templateDefinitions
        .map(def => {
            const content = loadSampleFile(def.filename);
            if (!content) return null;
            return {
                id: def.id,
                label: def.label,
                description: def.description,
                content
            };
        })
        .filter((t): t is SampleTemplate => t !== null);
}

/**
 * 後方互換性のためのエクスポート
 * @deprecated getSampleTemplates() を使用してください
 */
export const sampleTemplates: SampleTemplate[] = templateDefinitions.map(def => ({
    id: def.id,
    label: def.label,
    description: def.description,
    content: '' // 実際の内容は getSampleTemplates() で取得
}));

/**
 * サンプル設定ファイルを生成
 * @param configPath 設定ファイルのパス
 */
export async function generateSampleConfig(configPath: string): Promise<void> {
    // SSoTから生成されたテンプレートを読み込み
    const templates = getSampleTemplates();

    if (templates.length === 0) {
        vscode.window.showErrorMessage(
            'TaskPilot: サンプルテンプレートが見つかりません。拡張を再インストールしてください。'
        );
        return;
    }

    // テンプレート選択
    const selected = await vscode.window.showQuickPick(
        templates.map(t => ({
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
        vscode.window.showInformationMessage(
            `TaskPilot: ${selected.template.label.replace(/\$\([^)]+\)\s*/, '')}サンプルを生成しました`
        );
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
    return getSampleTemplates().find(t => t.id === id);
}
