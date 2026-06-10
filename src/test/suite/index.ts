import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
    // Mochaテストランナーを作成
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 60000
    });

    const testsRoot = path.resolve(__dirname, '.');

    // テストファイルを検索
    const files = await glob('**/**.test.js', { cwd: testsRoot });

    // テストファイルをMochaに追加
    files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

    return new Promise<void>((resolve, reject) => {
        try {
            // テストを実行
            const runner = mocha.run((failures: number) => {
                // exit code が host shutdown 事情で汚染された場合に、テスト自体の
                // 結果を log から判別できるようにする (#11459)
                console.error(`[SUITE DONE] failures=${failures}`);
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
            // mocha の epilogue (失敗詳細) は extension host 終了時の stdout
            // 切断で失われることがあるため、失敗発生時に即時 flush する (#11459)
            runner.on('fail', (test: Mocha.Runnable, err: Error) => {
                console.error(`[TEST FAIL] ${test.fullTitle()}`);
                console.error(`[TEST FAIL] ${err && (err.stack || err.message)}`);
            });
        } catch (runErr) {
            console.error(runErr);
            reject(runErr);
        }
    });
}
