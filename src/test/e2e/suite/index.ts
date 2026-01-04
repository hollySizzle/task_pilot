/**
 * E2E テストスイートエントリポイント
 */

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
    // Mochaテストランナーを作成
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 120000 // E2Eテストは長めのタイムアウト
    });

    const testsRoot = path.resolve(__dirname, '.');

    // E2Eテストファイルを検索
    const files = await glob('**/*.e2e.test.js', { cwd: testsRoot });

    // テストファイルをMochaに追加
    files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

    return new Promise<void>((resolve, reject) => {
        try {
            // テストを実行
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} E2E tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (runErr) {
            console.error(runErr);
            reject(runErr);
        }
    });
}
