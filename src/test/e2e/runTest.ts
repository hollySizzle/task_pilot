/**
 * E2E テストランナー
 * @vscode/test-electron を使用して実際のVS Code環境でテストを実行
 */

import * as path from 'path';
import * as fs from 'fs';
import {
    downloadAndUnzipVSCode,
    runTests
} from '@vscode/test-electron';

async function main() {
    try {
        // 拡張機能のルートディレクトリ
        const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

        // テストスイートへのパス
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // テスト用ワークスペースのパス
        const testWorkspacePath = path.resolve(__dirname, '../../../test-workspace');

        // workspace ディレクトリは gitignore されており CI には存在しない。
        // 存在しない path を渡すと Linux では folder が開かれず
        // workspaceFolders が空になり、e2e 全体が壊れる (#11548)。
        fs.mkdirSync(testWorkspacePath, { recursive: true });

        // CLI script ではなく electron 実行ファイルを渡す (#11459、unit 側と同じ)。
        // version pin の理由は src/test/runTest.ts を参照。
        const vscodeExecutablePath = await downloadAndUnzipVSCode('1.123.2');

        // VS Codeをダウンロードし、E2Eテストを実行
        await runTests({
            vscodeExecutablePath,
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
