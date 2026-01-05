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
 * 利用可能なテンプレートのメタ情報（ローカライズキーを使用）
 */
interface LocalizedTemplateDefinition extends TemplateDefinition {
    labelKey: string;
    descriptionKey: string;
}

const templateDefinitions: LocalizedTemplateDefinition[] = [
    {
        id: 'minimal',
        label: '', // runtime localized
        description: '', // runtime localized
        labelKey: 'Minimal',
        descriptionKey: 'Minimal description',
        filename: 'minimal.yaml'
    },
    {
        id: 'standard',
        label: '', // runtime localized
        description: '', // runtime localized
        labelKey: 'Standard',
        descriptionKey: 'Standard description',
        filename: 'standard.yaml'
    },
    {
        id: 'advanced',
        label: '', // runtime localized
        description: '', // runtime localized
        labelKey: 'Advanced',
        descriptionKey: 'Advanced description',
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
 * 現在の言語コードを取得
 */
function getCurrentLanguage(): string {
    const lang = vscode.env.language;
    // 日本語の場合は 'ja' を返す
    if (lang.startsWith('ja')) {
        return 'ja';
    }
    // それ以外は英語
    return 'en';
}

/**
 * サンプルファイルを読み込む
 * 言語設定に基づいて適切なファイルを選択
 * @param filename ファイル名
 */
function loadSampleFile(filename: string): string | undefined {
    if (!extensionPath) {
        console.error('Extension path not set');
        return undefined;
    }

    const lang = getCurrentLanguage();
    const samplePath = path.join(extensionPath, 'schemas', 'samples', lang, filename);

    try {
        return fs.readFileSync(samplePath, 'utf-8');
    } catch {
        console.error(`Failed to load sample file: ${samplePath}`);
        return undefined;
    }
}

/**
 * アイコンを付けたラベルを返す
 */
function getIconForTemplate(id: string): string {
    switch (id) {
        case 'minimal': return '$(file)';
        case 'standard': return '$(list-tree)';
        case 'advanced': return '$(rocket)';
        default: return '$(file)';
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
                label: `${getIconForTemplate(def.id)} ${vscode.l10n.t(def.labelKey)}`,
                description: vscode.l10n.t(def.descriptionKey),
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
            `TaskPilot: ${vscode.l10n.t('Sample templates not found. Please reinstall the extension.')}`
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
            placeHolder: vscode.l10n.t('Select a sample template'),
            title: `TaskPilot: ${vscode.l10n.t('Generate Sample Configuration')}`
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
        const overwriteLabel = vscode.l10n.t('Overwrite');
        const overwrite = await vscode.window.showWarningMessage(
            vscode.l10n.t('{0} already exists. Overwrite?', configPath),
            { modal: true },
            overwriteLabel
        );
        if (overwrite !== overwriteLabel) {
            return;
        }
    }

    // ファイル生成
    try {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(selected.template.content, 'utf-8'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        const templateName = selected.template.label.replace(/\$\([^)]+\)\s*/, '');
        vscode.window.showInformationMessage(
            `TaskPilot: ${vscode.l10n.t('{0} sample generated', templateName)}`
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`TaskPilot: ${vscode.l10n.t('Failed to generate sample: {0}', message)}`);
    }
}

/**
 * テンプレートIDからテンプレートを取得
 * @param id テンプレートID
 */
export function getTemplateById(id: string): SampleTemplate | undefined {
    return getSampleTemplates().find(t => t.id === id);
}
