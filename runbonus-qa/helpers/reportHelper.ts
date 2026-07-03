import fs from 'fs';
import path from 'path';
import { config } from './config';

export function buildSummaryReport(): void {
  const latest = path.join(process.cwd(), 'reports', 'json', 'report-latest.json');
  if (!fs.existsSync(latest)) return;

  const data = JSON.parse(fs.readFileSync(latest, 'utf8'));
  const htmlDir = path.join(process.cwd(), 'reports', 'html');
  fs.mkdirSync(htmlDir, { recursive: true });

  const suiteRows = (data.suites || [])
    .map(
      (s: { name: string; passed: number; total: number; failed: number }) =>
        `<tr><td>${s.name}</td><td>${s.passed}/${s.total}</td><td class="${s.failed ? 'fail' : 'pass'}">${s.failed ? 'FAIL' : 'PASS'}</td></tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>RunBonus QA Report</title>
<style>
body{font-family:system-ui;background:#131313;color:#eee;padding:24px}
h1{color:#c8ff00}.pass{color:#4ade80}.fail{color:#f87171}
table{border-collapse:collapse;width:100%;max-width:640px;margin-top:16px}
td,th{border:1px solid #333;padding:8px 12px;text-align:left}
th{background:#1a1a1a}
</style></head><body>
<h1>RunBonus QA Report</h1>
<p>Версия: ${config.appVersion} · ${new Date(data.date).toLocaleString('ru-RU')}</p>
<p>Всего: ${data.total} · Успешно: ${data.passed} · Ошибки: ${data.failed} · ${data.passRate}%</p>
<p><strong>${data.releaseAllowed ? '✅ Релиз разрешён' : '❌ Релиз запрещён'}</strong></p>
<table><thead><tr><th>Сьют</th><th>Тесты</th><th>Статус</th></tr></thead><tbody>${suiteRows}</tbody></table>
</body></html>`;

  fs.writeFileSync(path.join(htmlDir, 'index.html'), html);
}
