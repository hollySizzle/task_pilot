import * as path from 'path';
import {
    downloadAndUnzipVSCode,
    runTests
} from '@vscode/test-electron';

async function main() {
    try {
        // VS Code実行ファイルを含むフォルダ
        // 開発環境では自動的にダウンロードされる
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // テストランナースクリプトへのパス
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // CLI script を渡すと detach 起動して即 exit 0 になり、テストが
        // 1 件も走らないまま成功扱いになる (#11459)。electron 実行ファイルを
        // そのまま渡す。
        // version は pin する: 'stable' (default) だと release 当日に test 環境が
        // 勝手に変わる。1.124.0 では extension host が suite 途中で異常終了する
        // 事象を確認済み (#11459)。更新は意図的な commit で行う。
        const vscodeExecutablePath = await downloadAndUnzipVSCode('1.123.2');

        // VS Codeをダウンロードし、テストを実行
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions', // 他の拡張機能を無効化
            ]
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();
