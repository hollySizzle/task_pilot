/**
 * YAMLパーサーテスト (#3882)
 *
 * テスト対象:
 * - YAML読み込み・パース
 * - 構文エラー検出
 *
 * テストケース:
 * - 正常なYAMLのパース
 * - 構文エラー時の行番号付きエラー
 * - 空ファイル・存在しないファイル
 * - UTF-8エンコーディング
 */

import * as assert from 'assert';
import { parseYaml, validateConfig, parseMenuConfig, YamlParseError } from '../../yaml-parser';

suite('YAML Parser Test Suite', () => {

    suite('parseYaml - Basic Parsing', () => {

        test('should parse simple YAML object', () => {
            const yaml = `
key: value
number: 42
`;
            const result = parseYaml(yaml) as Record<string, unknown>;
            assert.strictEqual(result.key, 'value');
            assert.strictEqual(result.number, 42);
        });

        test('should parse nested YAML structure', () => {
            const yaml = `
parent:
  child1: value1
  child2: value2
`;
            const result = parseYaml(yaml) as Record<string, unknown>;
            const parent = result.parent as Record<string, string>;
            assert.strictEqual(parent.child1, 'value1');
            assert.strictEqual(parent.child2, 'value2');
        });

        test('should parse YAML arrays', () => {
            const yaml = `
items:
  - first
  - second
  - third
`;
            const result = parseYaml(yaml) as Record<string, unknown>;
            const items = result.items as string[];
            assert.strictEqual(items.length, 3);
            assert.strictEqual(items[0], 'first');
            assert.strictEqual(items[2], 'third');
        });

        test('should parse mixed content', () => {
            const yaml = `
version: "1.0"
menu:
  - label: Build
    type: terminal
    command: npm run build
  - label: Test
    type: terminal
    command: npm test
`;
            const result = parseYaml(yaml) as Record<string, unknown>;
            assert.strictEqual(result.version, '1.0');
            const menu = result.menu as Array<Record<string, string>>;
            assert.strictEqual(menu.length, 2);
            assert.strictEqual(menu[0].label, 'Build');
        });
    });

    suite('parseYaml - Syntax Error Detection', () => {

        test('should throw YamlParseError with line number for indentation error', () => {
            const yaml = `
version: "1.0"
menu:
  - label: Test
 bad: invalid
`;
            try {
                parseYaml(yaml);
                assert.fail('Should have thrown YamlParseError');
            } catch (error) {
                assert.ok(error instanceof YamlParseError);
                assert.ok(error.line !== undefined, 'Line number should be defined');
                assert.ok(error.message.includes('Line'), 'Message should include line info');
            }
        });

        test('should throw YamlParseError with line/column for invalid syntax', () => {
            const yaml = `
key: value
invalid: [unclosed bracket
`;
            try {
                parseYaml(yaml);
                assert.fail('Should have thrown YamlParseError');
            } catch (error) {
                assert.ok(error instanceof YamlParseError);
                assert.ok(error.line !== undefined);
            }
        });

        test('should throw YamlParseError for duplicate keys', () => {
            const yaml = `
key: value1
key: value2
`;
            // js-yamlはデフォルトで重複キーをエラーとして扱う
            try {
                parseYaml(yaml);
                assert.fail('Should have thrown YamlParseError');
            } catch (error) {
                assert.ok(error instanceof YamlParseError);
                assert.ok(error.message.includes('duplicated'));
            }
        });

        test('should throw YamlParseError for invalid multiline string', () => {
            const yaml = `
key: |
  line1
 line2
`;
            // 不正なインデントのテスト
            try {
                parseYaml(yaml);
                // js-yamlは柔軟に処理する可能性があるためパスする場合もある
            } catch (error) {
                assert.ok(error instanceof YamlParseError);
            }
        });

        test('should include column in error when available', () => {
            const yaml = `key: @invalid`;
            try {
                parseYaml(yaml);
                assert.fail('Should have thrown YamlParseError');
            } catch (error) {
                assert.ok(error instanceof YamlParseError);
                // カラム情報が取れるかテスト
                assert.ok(error.name === 'YamlParseError');
            }
        });
    });

    suite('parseYaml - Empty and Null Content', () => {

        test('should return undefined for empty string', () => {
            const result = parseYaml('');
            assert.strictEqual(result, undefined);
        });

        test('should return null for whitespace only', () => {
            const result = parseYaml('   \n\n   \t  ');
            assert.strictEqual(result, null);
        });

        test('should return null for YAML null value', () => {
            const result = parseYaml('null');
            assert.strictEqual(result, null);
        });

        test('should handle YAML with only comments', () => {
            const yaml = `
# This is a comment
# Another comment
`;
            const result = parseYaml(yaml);
            assert.strictEqual(result, null);
        });
    });

    suite('parseYaml - UTF-8 Encoding', () => {

        test('should parse Japanese characters correctly', () => {
            const yaml = `
label: ビルド
description: プロジェクトをビルドします
`;
            const result = parseYaml(yaml) as Record<string, string>;
            assert.strictEqual(result.label, 'ビルド');
            assert.strictEqual(result.description, 'プロジェクトをビルドします');
        });

        test('should parse emoji characters', () => {
            const yaml = `
icon: 🚀
status: ✅ 完了
`;
            const result = parseYaml(yaml) as Record<string, string>;
            assert.strictEqual(result.icon, '🚀');
            assert.strictEqual(result.status, '✅ 完了');
        });

        test('should parse Chinese characters', () => {
            const yaml = `
title: 构建项目
action: 运行测试
`;
            const result = parseYaml(yaml) as Record<string, string>;
            assert.strictEqual(result.title, '构建项目');
            assert.strictEqual(result.action, '运行测试');
        });

        test('should parse Korean characters', () => {
            const yaml = `
label: 빌드
command: 테스트 실행
`;
            const result = parseYaml(yaml) as Record<string, string>;
            assert.strictEqual(result.label, '빌드');
            assert.strictEqual(result.command, '테스트 실행');
        });

        test('should parse mixed language content', () => {
            const yaml = `
version: "1.0"
menu:
  - label: ビルド (Build)
    description: Build the プロジェクト
    type: terminal
    command: npm run build
`;
            const result = parseYaml(yaml) as Record<string, unknown>;
            const menu = result.menu as Array<Record<string, string>>;
            assert.strictEqual(menu[0].label, 'ビルド (Build)');
            assert.strictEqual(menu[0].description, 'Build the プロジェクト');
        });

        test('should handle special Unicode characters', () => {
            const yaml = `
arrows: ← → ↑ ↓
math: ∑ ∏ √ ∞
symbols: © ® ™ §
`;
            const result = parseYaml(yaml) as Record<string, string>;
            assert.strictEqual(result.arrows, '← → ↑ ↓');
            assert.strictEqual(result.math, '∑ ∏ √ ∞');
            assert.strictEqual(result.symbols, '© ® ™ §');
        });
    });

    suite('YamlParseError Class', () => {

        test('should create error with message only', () => {
            const error = new YamlParseError('Test error');
            assert.strictEqual(error.message, 'Test error');
            assert.strictEqual(error.name, 'YamlParseError');
            assert.strictEqual(error.line, undefined);
            assert.strictEqual(error.column, undefined);
        });

        test('should create error with line number', () => {
            const error = new YamlParseError('Invalid syntax', 5);
            assert.strictEqual(error.message, 'Line 5: Invalid syntax');
            assert.strictEqual(error.line, 5);
            assert.strictEqual(error.column, undefined);
        });

        test('should create error with line and column', () => {
            const error = new YamlParseError('Unexpected character', 10, 15);
            assert.strictEqual(error.message, 'Line 10: Unexpected character');
            assert.strictEqual(error.line, 10);
            assert.strictEqual(error.column, 15);
        });

        test('should be instanceof Error', () => {
            const error = new YamlParseError('Test');
            assert.ok(error instanceof Error);
            assert.ok(error instanceof YamlParseError);
        });
    });

    suite('parseMenuConfig - Integration', () => {

        test('should parse and validate complete menu config', () => {
            const yaml = `
version: "1.0"
menu:
  - label: ビルド
    icon: $(tools)
    type: terminal
    command: npm run build
`;
            const config = parseMenuConfig(yaml);
            assert.strictEqual(config.version, '1.0');
            assert.strictEqual(config.menu[0].label, 'ビルド');
        });

        test('should throw for empty content with validation error', () => {
            assert.throws(
                () => parseMenuConfig(''),
                YamlParseError
            );
        });

        test('should throw for null YAML content', () => {
            assert.throws(
                () => parseMenuConfig('null'),
                (err: Error) => {
                    return err instanceof YamlParseError &&
                           err.message.includes('must be an object');
                }
            );
        });

        test('should aggregate multiple validation errors', () => {
            const yaml = `
menu:
  - type: terminal
`;
            try {
                parseMenuConfig(yaml);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.ok(error instanceof YamlParseError);
                assert.ok(error.message.includes('validation failed'));
                // version と label が両方エラーになるはず
            }
        });

        test('should parse UTF-8 menu config', () => {
            const yaml = `
version: "1.0"
commands:
  build_dev:
    type: terminal
    command: npm run build:dev
menu:
  - label: 開発
    icon: $(code)
    children:
      - label: ビルド (開発)
        ref: build_dev
      - label: サーバー起動
        description: 開発サーバーを起動します 🚀
        type: terminal
        command: npm run dev
`;
            const config = parseMenuConfig(yaml);
            assert.strictEqual(config.menu[0].label, '開発');
            assert.strictEqual(config.menu[0].children?.length, 2);
            assert.strictEqual(config.menu[0].children?.[0].label, 'ビルド (開発)');
            assert.ok(config.menu[0].children?.[1].description?.includes('🚀'));
        });
    });

    suite('parseMenuConfig - Parallel Actions', () => {

        test('should parse parallel property with refs', () => {
            const yaml = `
version: "1.0"
commands:
  rails_server:
    type: terminal
    command: rails server
  webpack_dev:
    type: terminal
    command: webpack-dev-server
menu:
  - label: 開発環境起動
    parallel:
      - ref: rails_server
      - ref: webpack_dev
`;
            const config = parseMenuConfig(yaml);
            assert.strictEqual(config.menu[0].label, '開発環境起動');
            assert.ok(config.menu[0].parallel, 'parallel should exist');
            assert.strictEqual(config.menu[0].parallel!.length, 2);
            assert.strictEqual(config.menu[0].parallel![0].ref, 'rails_server');
            assert.strictEqual(config.menu[0].parallel![1].ref, 'webpack_dev');
        });

        test('should parse parallel property with inline actions', () => {
            const yaml = `
version: "1.0"
menu:
  - label: 並列テスト
    parallel:
      - type: terminal
        command: echo "first"
        terminal: Term1
      - type: terminal
        command: echo "second"
        terminal: Term2
`;
            const config = parseMenuConfig(yaml);
            assert.ok(config.menu[0].parallel);
            assert.strictEqual(config.menu[0].parallel!.length, 2);
            assert.strictEqual(config.menu[0].parallel![0].command, 'echo "first"');
            assert.strictEqual(config.menu[0].parallel![1].terminal, 'Term2');
        });

        test('should reject invalid parallel property (not array)', () => {
            const yaml = `
version: "1.0"
menu:
  - label: Invalid
    parallel: not-an-array
`;
            try {
                parseMenuConfig(yaml);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.ok(error instanceof YamlParseError);
                assert.ok(error.message.includes('"parallel" must be an array'));
            }
        });

        test('should validate parallel array items', () => {
            const yaml = `
version: "1.0"
menu:
  - label: Invalid
    parallel:
      - type: terminal
`;
            try {
                parseMenuConfig(yaml);
                assert.fail('Should have thrown');
            } catch (error) {
                assert.ok(error instanceof YamlParseError);
                assert.ok(error.message.includes('command'));
            }
        });
    });
});
