/**
 * sample-generator.ts のテスト
 * サンプル設定ファイル生成機能のテスト
 *
 * SSoT対応: テンプレートはschemas/samples/から読み込まれます
 */

import * as assert from 'assert';
import * as path from 'path';
import { sampleTemplates, getSampleTemplates, getTemplateById, setExtensionPath } from '../../sample-generator';
import { parseMenuConfig, validateConfig } from '../../yaml-parser';

// テスト用にextensionPathを設定（プロジェクトルート）
const projectRoot = path.resolve(__dirname, '../../../');

suite('sample-generator Test Suite', () => {
    // テスト前にextensionPathを設定
    suiteSetup(() => {
        setExtensionPath(projectRoot);
    });

    suite('sampleTemplates（後方互換）', () => {
        test('3つのテンプレート定義がある', () => {
            assert.strictEqual(sampleTemplates.length, 3);
        });

        test('各テンプレートにメタ情報がある', () => {
            for (const template of sampleTemplates) {
                assert.ok(template.id, 'idが定義されていること');
                assert.ok(template.label, 'labelが定義されていること');
                assert.ok(template.description, 'descriptionが定義されていること');
            }
        });
    });

    suite('getSampleTemplates（SSoT対応）', () => {
        test('3つのテンプレートが読み込まれる', () => {
            const templates = getSampleTemplates();
            assert.strictEqual(templates.length, 3);
        });

        test('各テンプレートに必須プロパティがある', () => {
            const templates = getSampleTemplates();
            for (const template of templates) {
                assert.ok(template.id, 'idが定義されていること');
                assert.ok(template.label, 'labelが定義されていること');
                assert.ok(template.description, 'descriptionが定義されていること');
                assert.ok(template.content, 'contentが定義されていること');
                assert.ok(template.content.length > 0, 'contentが空でないこと');
            }
        });

        test('minimal テンプレートが存在する', () => {
            const templates = getSampleTemplates();
            const minimal = templates.find(t => t.id === 'minimal');
            assert.ok(minimal);
            assert.ok(minimal.label.includes('最小構成'));
        });

        test('standard テンプレートが存在する', () => {
            const templates = getSampleTemplates();
            const standard = templates.find(t => t.id === 'standard');
            assert.ok(standard);
            assert.ok(standard.label.includes('標準構成'));
        });

        test('advanced テンプレートが存在する', () => {
            const templates = getSampleTemplates();
            const advanced = templates.find(t => t.id === 'advanced');
            assert.ok(advanced);
            assert.ok(advanced.label.includes('フル機能'));
        });
    });

    suite('getTemplateById', () => {
        test('存在するIDでテンプレートを取得できる', () => {
            const minimal = getTemplateById('minimal');
            assert.ok(minimal);
            assert.strictEqual(minimal.id, 'minimal');
        });

        test('存在しないIDはundefinedを返す', () => {
            const notExist = getTemplateById('not-exist');
            assert.strictEqual(notExist, undefined);
        });
    });

    suite('テンプレート内容の妥当性', () => {
        test('minimalテンプレートが有効なYAMLである', () => {
            const template = getTemplateById('minimal');
            assert.ok(template);

            const config = parseMenuConfig(template.content);
            const { result } = validateConfig(config);

            assert.ok(result.valid, `Validation errors: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`);
        });

        test('standardテンプレートが有効なYAMLである', () => {
            const template = getTemplateById('standard');
            assert.ok(template);

            const config = parseMenuConfig(template.content);
            const { result } = validateConfig(config);

            assert.ok(result.valid, `Validation errors: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`);
        });

        test('advancedテンプレートが有効なYAMLである', () => {
            const template = getTemplateById('advanced');
            assert.ok(template);

            const config = parseMenuConfig(template.content);
            const { result } = validateConfig(config);

            assert.ok(result.valid, `Validation errors: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`);
        });

        test('minimalテンプレートはシンプルな構造である', () => {
            const template = getTemplateById('minimal');
            assert.ok(template);

            const config = parseMenuConfig(template.content);

            // commandsセクションがない
            assert.ok(!config.commands || Object.keys(config.commands).length === 0);
            // メニューアイテムが存在
            assert.ok(config.menu.length >= 1);
            // 子メニューがない（フラット構造）
            for (const item of config.menu) {
                assert.ok(!item.children || item.children.length === 0);
            }
        });

        test('standardテンプレートはref/childrenを含む', () => {
            const template = getTemplateById('standard');
            assert.ok(template);

            const config = parseMenuConfig(template.content);

            // commandsセクションがある
            assert.ok(config.commands && Object.keys(config.commands).length > 0);

            // childrenを持つメニューがある
            const hasChildren = config.menu.some(item => item.children && item.children.length > 0);
            assert.ok(hasChildren, 'childrenを持つメニューが存在すること');

            // refを使用しているメニューがある
            const hasRef = config.menu.some(item =>
                item.ref || (item.children && item.children.some(child => child.ref))
            );
            assert.ok(hasRef, 'refを使用しているメニューが存在すること');
        });

        test('advancedテンプレートはparallel/actionsを含む', () => {
            const template = getTemplateById('advanced');
            assert.ok(template);

            const config = parseMenuConfig(template.content);

            // parallelを持つメニューがある
            const findParallel = (items: typeof config.menu): boolean => {
                return items.some(item =>
                    item.parallel || (item.children && findParallel(item.children))
                );
            };
            assert.ok(findParallel(config.menu), 'parallelを持つメニューが存在すること');

            // actionsを持つメニューがある
            const findActions = (items: typeof config.menu): boolean => {
                return items.some(item =>
                    item.actions || (item.children && findActions(item.children))
                );
            };
            assert.ok(findActions(config.menu), 'actionsを持つメニューが存在すること');
        });
    });

    suite('テンプレートの内容ガイドライン', () => {
        test('テンプレートがフレームワーク依存でない', () => {
            const templates = getSampleTemplates();
            for (const template of templates) {
                // Rails, Django, Laravel などの特定フレームワーク名を含まない
                const frameworkNames = ['rails', 'django', 'laravel', 'spring', 'express'];
                const content = template.content.toLowerCase();

                for (const fw of frameworkNames) {
                    assert.ok(
                        !content.includes(fw),
                        `${template.id} テンプレートが ${fw} に依存していないこと`
                    );
                }
            }
        });

        test('テンプレートに日本語コメントが含まれている', () => {
            const templates = getSampleTemplates();
            for (const template of templates) {
                // 日本語文字が含まれているか確認
                const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(template.content);
                assert.ok(hasJapanese, `${template.id} テンプレートに日本語コメントがあること`);
            }
        });

        test('テンプレートにSSoT生成マーカーがある', () => {
            const templates = getSampleTemplates();
            for (const template of templates) {
                // SSoT生成マーカーが含まれているか確認
                assert.ok(
                    template.content.includes('Generated from types.ts'),
                    `${template.id} テンプレートにSSoT生成マーカーがあること`
                );
            }
        });
    });
});
