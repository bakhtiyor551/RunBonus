import fs from 'fs';
import path from 'path';
import WDIOReporter from '@wdio/reporter';
import type { RunnerStats, SuiteStats } from '@wdio/types/build/Frameworks';
import type { Reporters } from '@wdio/types';
import { config as appConfig } from '../helpers/config';

interface SuiteResult {
  name: string;
  passed: number;
  failed: number;
  total: number;
}

export default class RunBonusReporter extends WDIOReporter {
  private results: SuiteResult[] = [];
  private currentSuite = 'UNKNOWN';
  private passed = 0;
  private failed = 0;

  constructor(options: Reporters.Options) {
    super(options);
  }

  onRunnerStart(): void {
    fs.mkdirSync(path.join(process.cwd(), 'reports', 'json'), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), 'screenshots'), { recursive: true });
  }

  onSuiteStart(suite: SuiteStats): void {
    if (this.currentSuite !== 'UNKNOWN' && (this.passed > 0 || this.failed > 0)) {
      this.flushSuite();
    }
    this.currentSuite = suite.title.split('/')[0]?.toUpperCase() || suite.title;
    this.passed = 0;
    this.failed = 0;
  }

  onTestPass(): void {
    this.passed += 1;
  }

  onTestFail(): void {
    this.failed += 1;
  }

  onRunnerEnd(_runnerStats: RunnerStats): void {
    this.flushSuite();
    const total = this.results.reduce((s, r) => s + r.total, 0);
    const passed = this.results.reduce((s, r) => s + r.passed, 0);
    const failed = total - passed;

    const lines = [
      '',
      'RunBonus QA Report',
      '═'.repeat(40),
      `Дата: ${new Date().toLocaleString('ru-RU')}`,
      `Версия приложения: ${appConfig.appVersion}`,
      '',
      `Всего тестов: ${total}`,
      `Успешно: ${passed}`,
      `Ошибки: ${failed}`,
      '',
    ];

    for (const r of this.results) {
      const status = r.failed === 0 ? 'PASS' : 'FAIL';
      const dots = '.'.repeat(Math.max(1, 12 - r.name.length));
      lines.push(`${r.name} ${dots} ${status}`);
    }

    const report = {
      date: new Date().toISOString(),
      appVersion: appConfig.appVersion,
      total,
      passed,
      failed,
      passRate: total ? Math.round((passed / total) * 100) : 0,
      suites: this.results,
      releaseAllowed: failed === 0 && (total ? passed / total >= 0.95 : false),
    };

    fs.writeFileSync(
      path.join(process.cwd(), 'reports', 'json', 'report-latest.json'),
      JSON.stringify(report, null, 2)
    );

    const txt = lines.join('\n') + '\n';
    fs.writeFileSync(path.join(process.cwd(), 'reports', 'report-latest.txt'), txt);
    console.log(txt);
  }

  private flushSuite(): void {
    if (this.passed === 0 && this.failed === 0) return;
    this.results.push({
      name: this.currentSuite,
      passed: this.passed,
      failed: this.failed,
      total: this.passed + this.failed,
    });
  }
}
