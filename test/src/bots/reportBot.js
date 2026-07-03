import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from '../config.js';
import { logInfo } from '../core/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, '..', '..', 'reports');

const CRITICAL_SUITES = ['gps', 'offline', 'sync'];

/**
 * Report Bot — формирует итоговый отчёт и проверяет критерии релиза.
 */
export function generateReport(suiteResults) {
  const allTests = suiteResults.flatMap((s) =>
    s.results.map((r) => ({ ...r, suiteKey: s.key, suiteName: s.suiteName }))
  );

  const total = allTests.length;
  const passed = allTests.filter((t) => t.pass).length;
  const failed = total - passed;
  const passRate = total ? Math.round((passed / total) * 100) : 0;

  const suiteLines = suiteResults.map((s) => {
    const sTotal = s.results.length;
    const sPassed = s.results.filter((r) => r.pass).length;
    const status = sPassed === sTotal ? 'PASS' : 'FAIL';
    const dots = '.'.repeat(Math.max(1, 18 - s.suiteName.length));
    return `${s.suiteName} ${dots} ${status}`;
  });

  const failedTests = allTests.filter((t) => !t.pass);

  const suiteStats = Object.fromEntries(
    suiteResults.map((s) => {
      const sTotal = s.results.length;
      const sPassed = s.results.filter((r) => r.pass).length;
      return [s.key, { total: sTotal, passed: sPassed, rate: sTotal ? (sPassed / sTotal) * 100 : 0 }];
    })
  );

  const criticalFailures = CRITICAL_SUITES.filter(
    (key) => suiteStats[key] && suiteStats[key].rate < 100
  );

  const releaseAllowed =
    criticalFailures.length === 0 &&
    passRate >= 95 &&
    failedTests.filter((t) => CRITICAL_SUITES.includes(t.suiteKey)).length === 0;

  const text = [
    '',
    'RunBonus QA Report',
    '═'.repeat(40),
    `Версия приложения: ${config.appVersion}`,
    `Дата: ${new Date().toLocaleString('ru-RU')}`,
    `API: ${config.baseApiUrl}`,
  `Режим: ${config.fastMode ? 'FAST' : 'PRODUCTION'}`,
    '',
    `Всего тестов: ${total}`,
    `Успешно: ${passed}`,
    `Ошибка: ${failed}`,
    `Процент: ${passRate}%`,
    '',
    ...suiteLines,
    '',
    'Критерии релиза:',
    `  GPS тесты = 100% PASS: ${suiteStats.gps?.rate === 100 ? '✓' : '✗'}`,
    `  Offline тесты = 100% PASS: ${suiteStats.offline?.rate === 100 ? '✓' : '✗'}`,
    `  Синхронизация = 100% PASS: ${suiteStats.sync?.rate === 100 ? '✓' : '✗'}`,
    `  Критических ошибок = 0: ${criticalFailures.length === 0 ? '✓' : '✗'}`,
    `  Общий процент ≥ 95%: ${passRate >= 95 ? '✓' : '✗'}`,
    '',
    releaseAllowed ? '✅ РЕЛИЗ РАЗРЕШЁН' : '❌ РЕЛИЗ ЗАПРЕЩЁН',
    '',
  ];

  if (failedTests.length) {
    text.push('Неуспешные тесты:');
    for (const t of failedTests) {
      text.push(`  • ${t.id}: ${t.error}`);
      if (t.artifact) text.push(`    артефакт: ${t.artifact}`);
    }
    text.push('');
  }

  const reportText = text.join('\n');

  mkdirSync(REPORTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = join(REPORTS_DIR, `report-${ts}.json`);
  const txtPath = join(REPORTS_DIR, `report-${ts}.txt`);

  const json = {
    appVersion: config.appVersion,
    date: new Date().toISOString(),
    api: config.baseApiUrl,
    fastMode: config.fastMode,
    total,
    passed,
    failed,
    passRate,
    suiteStats,
    releaseAllowed,
    criticalFailures,
    suites: suiteResults,
    failedTests: failedTests.map((t) => ({
      id: t.id,
      suite: t.suiteKey,
      error: t.error,
      artifact: t.artifact,
    })),
  };

  writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
  writeFileSync(txtPath, reportText, 'utf8');

  logInfo(`Отчёт: ${txtPath}`);

  return { reportText, json, jsonPath, txtPath, releaseAllowed, passRate, failed };
}
