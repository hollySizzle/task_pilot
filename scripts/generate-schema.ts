/**
 * JSON Schema Generator
 *
 * types.tsからJSON Schemaを自動生成するスクリプト。
 * SSoT（Single Source of Truth）パイプラインの一部。
 *
 * 使用方法:
 *   npx ts-node scripts/generate-schema.ts
 *
 * 出力:
 *   schemas/taskpilot.schema.json
 */

import * as tsj from 'ts-json-schema-generator';
import * as fs from 'fs';
import * as path from 'path';

const config: tsj.Config = {
    path: path.resolve(__dirname, '../src/types.ts'),
    tsconfig: path.resolve(__dirname, '../tsconfig.json'),
    type: 'MenuConfig', // ルート型
    expose: 'export',
    topRef: false,
    jsDoc: 'extended', // JSDocを完全にサポート
    sortProps: true,
    strictTuples: false,
    skipTypeCheck: false,
    encodeRefs: true,
    additionalProperties: false, // 追加プロパティを禁止
};

function generateSchema(): void {
    console.log('Generating JSON Schema from types.ts...');

    try {
        const generator = tsj.createGenerator(config);
        const schema = generator.createSchema(config.type);

        // スキーマにメタ情報を追加
        const enhancedSchema = {
            $schema: 'http://json-schema.org/draft-07/schema#',
            $id: 'https://taskpilot.dev/schema/v1/taskpilot.schema.json',
            title: 'TaskPilot Configuration',
            description:
                'TaskPilotのYAML設定ファイルのスキーマ。VS Codeでの補完とバリデーションに使用されます。',
            ...schema,
        };

        // 出力ディレクトリ作成
        const outputDir = path.resolve(__dirname, '../schemas');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // スキーマをファイルに出力
        const outputPath = path.join(outputDir, 'taskpilot.schema.json');
        fs.writeFileSync(outputPath, JSON.stringify(enhancedSchema, null, 2), 'utf-8');

        console.log(`Schema generated successfully: ${outputPath}`);

        // 簡単な統計情報を表示
        const definitionsCount = Object.keys(schema.definitions || {}).length;
        console.log(`  - Definitions: ${definitionsCount}`);
        console.log(`  - Root type: ${config.type}`);
    } catch (error) {
        console.error('Error generating schema:', error);
        process.exit(1);
    }
}

generateSchema();
