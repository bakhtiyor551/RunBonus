const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

export function logInfo(msg) {
  console.log(`${COLORS.cyan}[INFO]${COLORS.reset} ${msg}`);
}

export function logStep(msg) {
  console.log(`${COLORS.dim}  →${COLORS.reset} ${msg}`);
}

export function logSuccess(msg) {
  console.log(`${COLORS.green}[PASS]${COLORS.reset} ${msg}`);
}

export function logFail(msg) {
  console.error(`${COLORS.red}[FAIL]${COLORS.reset} ${msg}`);
}

export function logWarn(msg) {
  console.warn(`${COLORS.yellow}[WARN]${COLORS.reset} ${msg}`);
}

export function logSuite(name) {
  console.log(`\n${COLORS.cyan}━━━ ${name} ━━━${COLORS.reset}`);
}
