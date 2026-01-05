/**
 * Sample YAML Generator
 *
 * JSON Schemaからコメント付きサンプルYAMLを自動生成するスクリプト。
 * SSoT（Single Source of Truth）パイプラインの一部。
 *
 * 使用方法:
 *   npx ts-node scripts/generate-samples.ts
 *
 * 出力:
 *   schemas/samples/minimal.yaml
 *   schemas/samples/standard.yaml
 *   schemas/samples/advanced.yaml
 */

import * as fs from 'fs';
import * as path from 'path';

interface SchemaProperty {
    type?: string;
    description?: string;
    examples?: unknown[];
    default?: unknown;
    enum?: string[];
    items?: SchemaProperty;
    $ref?: string;
    additionalProperties?: SchemaProperty | boolean;
    properties?: Record<string, SchemaProperty>;
    required?: string[];
}

interface Schema {
    definitions?: Record<string, SchemaProperty>;
    properties?: Record<string, SchemaProperty>;
    required?: string[];
}

/**
 * スキーマを読み込む
 */
function loadSchema(): Schema {
    const schemaPath = path.resolve(__dirname, '../schemas/taskpilot.schema.json');
    const content = fs.readFileSync(schemaPath, 'utf-8');
    return JSON.parse(content);
}

/**
 * 説明文を1行コメントに変換
 */
function formatComment(description: string | undefined, indent: string): string {
    if (!description) return '';
    // 最初の1文または100文字まで
    const firstLine = description.split('\n')[0].substring(0, 100);
    return `${indent}# ${firstLine}\n`;
}

/**
 * $refを解決して定義を取得
 */
function resolveRef(schema: Schema, ref: string): SchemaProperty | undefined {
    const match = ref.match(/#\/definitions\/(.+)/);
    if (match && schema.definitions) {
        return schema.definitions[match[1]];
    }
    return undefined;
}

/**
 * プロパティからサンプル値を取得
 */
function getSampleValue(
    prop: SchemaProperty,
    schema: Schema,
    defaultValue?: unknown
): unknown {
    if (defaultValue !== undefined) return defaultValue;
    if (prop.examples && prop.examples.length > 0) return prop.examples[0];
    if (prop.default !== undefined) return prop.default;
    if (prop.enum && prop.enum.length > 0) return prop.enum[0];
    if (prop.$ref) {
        const resolved = resolveRef(schema, prop.$ref);
        if (resolved) return getSampleValue(resolved, schema);
    }
    if (prop.type === 'string') return 'example';
    if (prop.type === 'boolean') return false;
    if (prop.type === 'number' || prop.type === 'integer') return 0;
    if (prop.type === 'array') return [];
    if (prop.type === 'object') return {};
    return null;
}

/**
 * YAML値をフォーマット
 */
function formatYamlValue(value: unknown): string {
    if (typeof value === 'string') {
        // 特殊文字を含む場合はクォート
        if (value.includes(':') || value.includes('#') || value.includes("'") || value.includes('"') || value.startsWith('$(')) {
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        return value;
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.length === 0 ? '[]' : '';
    if (typeof value === 'object' && value !== null) return '';
    return String(value);
}

/**
 * 最小構成サンプルを生成
 */
function generateMinimalSample(schema: Schema): string {
    const lines: string[] = [
        '# TaskPilot - 最小構成サンプル',
        '# 基本的なメニュー構成の例',
        '# Generated from types.ts (SSoT)',
        '',
    ];

    lines.push('version: "1.0"');
    lines.push('');
    lines.push('menu:');
    lines.push('  - label: Build');
    lines.push('    icon: "$(package)"');
    lines.push('    type: terminal');
    lines.push('    command: npm run build');
    lines.push('');
    lines.push('  - label: Test');
    lines.push('    icon: "$(beaker)"');
    lines.push('    type: terminal');
    lines.push('    command: npm test');

    return lines.join('\n') + '\n';
}

/**
 * 標準構成サンプルを生成（ref/children付き）
 */
function generateStandardSample(schema: Schema): string {
    const lines: string[] = [
        '# TaskPilot - 標準構成サンプル',
        '# ref（参照）とchildren（子メニュー）の使用例',
        '# Generated from types.ts (SSoT)',
        '',
    ];

    // commands section with comments from schema
    const commandDef = schema.definitions?.CommandDefinition;
    if (commandDef?.description) {
        lines.push(`# ${commandDef.description.split('\n')[0]}`);
    }
    lines.push('commands:');
    lines.push('  build:');
    lines.push('    type: terminal');
    lines.push('    command: npm run build');
    lines.push('    description: プロジェクトをビルド');
    lines.push('  test:');
    lines.push('    type: terminal');
    lines.push('    command: npm test');
    lines.push('    description: テストを実行');
    lines.push('  lint:');
    lines.push('    type: terminal');
    lines.push('    command: npm run lint');
    lines.push('    description: Lintチェック');
    lines.push('');

    lines.push('version: "1.0"');
    lines.push('');

    // menu section
    const menuItemDef = schema.definitions?.MenuItem;
    if (menuItemDef?.properties?.children?.description) {
        lines.push(`# children: ${menuItemDef.properties.children.description.split('\n')[0]}`);
    }
    lines.push('menu:');
    lines.push('  - label: Development');
    lines.push('    icon: "$(tools)"');
    lines.push('    description: 開発用コマンド');
    lines.push('    children:');
    if (menuItemDef?.properties?.ref?.description) {
        lines.push(`      # ref: ${menuItemDef.properties.ref.description.split('\n')[0]}`);
    }
    lines.push('      - label: Build');
    lines.push('        icon: "$(package)"');
    lines.push('        ref: build');
    lines.push('      - label: Test');
    lines.push('        icon: "$(beaker)"');
    lines.push('        ref: test');
    lines.push('      - label: Lint');
    lines.push('        icon: "$(checklist)"');
    lines.push('        ref: lint');
    lines.push('      - label: Watch');
    lines.push('        icon: "$(eye)"');
    lines.push('        type: terminal');
    lines.push('        command: npm run watch');
    lines.push('');
    lines.push('  - label: Git');
    lines.push('    icon: "$(git-branch)"');
    lines.push('    children:');
    lines.push('      - label: Status');
    lines.push('        icon: "$(info)"');
    lines.push('        type: terminal');
    lines.push('        command: git status');
    lines.push('      - label: Pull');
    lines.push('        icon: "$(cloud-download)"');
    lines.push('        type: terminal');
    lines.push('        command: git pull');
    lines.push('      - label: Push');
    lines.push('        icon: "$(cloud-upload)"');
    lines.push('        type: terminal');
    lines.push('        command: git push');
    lines.push('');
    lines.push('  - label: Settings');
    lines.push('    icon: "$(gear)"');
    lines.push('    type: vscodeCommand');
    lines.push('    command: workbench.action.openSettings');

    return lines.join('\n') + '\n';
}

/**
 * フル機能サンプルを生成（parallel/actions含む）
 */
function generateAdvancedSample(schema: Schema): string {
    const lines: string[] = [
        '# TaskPilot - フル機能サンプル',
        '# 全機能のデモ: parallel（並列実行）, actions（順次実行）, ref など',
        '# Generated from types.ts (SSoT)',
        '',
    ];

    lines.push('version: "1.0"');
    lines.push('');
    lines.push('commands:');
    lines.push('  build:');
    lines.push('    type: terminal');
    lines.push('    command: npm run build');
    lines.push('    description: プロジェクトをビルド');
    lines.push('  test:');
    lines.push('    type: terminal');
    lines.push('    command: npm test');
    lines.push('    description: テストを実行');
    lines.push('  lint:');
    lines.push('    type: terminal');
    lines.push('    command: npm run lint');
    lines.push('    description: Lintチェック');
    lines.push('  start:');
    lines.push('    type: terminal');
    lines.push('    command: npm start');
    lines.push('    description: 開発サーバー起動');
    lines.push('    terminal: server');
    lines.push('');
    lines.push('menu:');
    lines.push('  - label: Development');
    lines.push('    icon: "$(tools)"');
    lines.push('    description: 開発用コマンド');
    lines.push('    children:');
    lines.push('      - label: Build');
    lines.push('        icon: "$(package)"');
    lines.push('        ref: build');
    lines.push('      - label: Test');
    lines.push('        icon: "$(beaker)"');
    lines.push('        ref: test');
    lines.push('      - label: Lint');
    lines.push('        icon: "$(checklist)"');
    lines.push('        ref: lint');
    lines.push('');

    // actions section with schema comments
    const menuItemDef = schema.definitions?.MenuItem;
    if (menuItemDef?.properties?.actions?.description) {
        lines.push(`  # actions: ${menuItemDef.properties.actions.description.split('\n')[0]}`);
    }
    lines.push('  - label: CI Pipeline');
    lines.push('    icon: "$(rocket)"');
    lines.push('    description: Lint → Test → Build を順番に実行');
    lines.push('    actions:');
    lines.push('      - ref: lint');
    lines.push('      - ref: test');
    lines.push('      - ref: build');
    if (menuItemDef?.properties?.continueOnError?.description) {
        lines.push(`    # continueOnError: ${menuItemDef.properties.continueOnError.description.split('\n')[0]}`);
    }
    lines.push('    # continueOnError: true');
    lines.push('');

    // parallel section with schema comments
    if (menuItemDef?.properties?.parallel?.description) {
        lines.push(`  # parallel: ${menuItemDef.properties.parallel.description.split('\n')[0]}`);
    }
    lines.push('  - label: Dev Environment');
    lines.push('    icon: "$(split-horizontal)"');
    lines.push('    description: サーバーとウォッチを並列起動');
    lines.push('    parallel:');
    lines.push('      - type: terminal');
    lines.push('        command: npm run watch');
    lines.push('        terminal: watch');
    lines.push('        description: ファイル変更を監視');
    lines.push('      - ref: start');
    lines.push('');
    lines.push('  - label: Git');
    lines.push('    icon: "$(git-branch)"');
    lines.push('    children:');
    lines.push('      - label: Basic');
    lines.push('        icon: "$(versions)"');
    lines.push('        children:');
    lines.push('          - label: Status');
    lines.push('            icon: "$(info)"');
    lines.push('            type: terminal');
    lines.push('            command: git status');
    lines.push('          - label: Log');
    lines.push('            icon: "$(history)"');
    lines.push('            type: terminal');
    lines.push('            command: git log --oneline -10');
    lines.push('      - label: Sync');
    lines.push('        icon: "$(sync)"');
    lines.push('        children:');
    lines.push('          - label: Pull');
    lines.push('            icon: "$(cloud-download)"');
    lines.push('            type: terminal');
    lines.push('            command: git pull');
    lines.push('          - label: Push');
    lines.push('            icon: "$(cloud-upload)"');
    lines.push('            type: terminal');
    lines.push('            command: git push');
    lines.push('');
    lines.push('  - label: Editor');
    lines.push('    icon: "$(window)"');
    lines.push('    children:');
    lines.push('      - label: Settings');
    lines.push('        icon: "$(gear)"');
    lines.push('        type: vscodeCommand');
    lines.push('        command: workbench.action.openSettings');
    lines.push('      - label: Keyboard Shortcuts');
    lines.push('        icon: "$(keyboard)"');
    lines.push('        type: vscodeCommand');
    lines.push('        command: workbench.action.openGlobalKeybindings');
    lines.push('      - label: Extensions');
    lines.push('        icon: "$(extensions)"');
    lines.push('        type: vscodeCommand');
    lines.push('        command: workbench.extensions.action.showInstalledExtensions');
    lines.push('');

    // cwd example with schema comment
    const commandDef = schema.definitions?.CommandDefinition;
    if (commandDef?.properties?.cwd?.description) {
        lines.push(`  # cwd: ${commandDef.properties.cwd.description.split('\n')[0]}`);
    }
    lines.push('  - label: Subproject');
    lines.push('    icon: "$(folder)"');
    lines.push('    description: サブディレクトリで実行');
    lines.push('    type: terminal');
    lines.push('    command: npm install');
    lines.push('    cwd: ./packages/subproject');

    return lines.join('\n') + '\n';
}

function main(): void {
    console.log('Generating sample YAML files from schema...');

    try {
        const schema = loadSchema();

        // 出力ディレクトリ作成
        const outputDir = path.resolve(__dirname, '../schemas/samples');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 各サンプルを生成
        const samples = [
            { name: 'minimal', generator: generateMinimalSample },
            { name: 'standard', generator: generateStandardSample },
            { name: 'advanced', generator: generateAdvancedSample },
        ];

        for (const sample of samples) {
            const content = sample.generator(schema);
            const outputPath = path.join(outputDir, `${sample.name}.yaml`);
            fs.writeFileSync(outputPath, content, 'utf-8');
            console.log(`  Generated: ${outputPath}`);
        }

        console.log('Sample generation completed!');
    } catch (error) {
        console.error('Error generating samples:', error);
        process.exit(1);
    }
}

main();
