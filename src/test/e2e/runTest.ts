/**
 * E2E テストランナー
 * @vscode/test-electron を使用して実際のVS Code環境でテストを実行
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        // 拡張機能のルートディレクトリ
        const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

        // テストスイートへのパス
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // テスト用ワークスペースのパス
        const testWorkspacePath = path.resolve(__dirname, '../../../test-workspace');

        // VS Codeをダウンロードし、E2Eテストを実行
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                testWorkspacePath,
                '--disable-extensions', // 他の拡張機能を無効化
                '--disable-gpu', // GPU無効化（CI環境対応）
            ]
        });
    } catch (err) {
        console.error('Failed to run E2E tests:', err);
        process.exit(1);
    }
}

main();
