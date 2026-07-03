import fs from 'fs';
import path from 'path';

const htmlDir = path.join(process.cwd(), 'reports', 'html');
fs.mkdirSync(htmlDir, { recursive: true });

const latest = path.join(process.cwd(), 'reports', 'json', 'report-latest.json');
if (fs.existsSync(latest)) {
  const data = JSON.parse(fs.readFileSync(latest, 'utf8'));
  console.log(`HTML report data: ${data.passed}/${data.total} passed`);
}

console.log('Open reports/html/index.html after test run (generated in onComplete).');
