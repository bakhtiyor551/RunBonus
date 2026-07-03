import type { Options } from '@wdio/types';
import path from 'path';
import { androidCapabilities } from './helpers/config';

const root = __dirname;

export const baseConfig: Options.Testrunner = {
  runner: 'local',
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: { project: path.join(root, 'tsconfig.json'), transpileOnly: true },
  },

  specs: ['./tests/**/*.spec.ts'],
  exclude: [],

  suites: {
    auth: ['./tests/auth/**/*.spec.ts'],
    profile: ['./tests/profile/**/*.spec.ts'],
    shop: ['./tests/shop/**/*.spec.ts'],
    shoes: ['./tests/shoes/**/*.spec.ts'],
    gps: ['./tests/gps/**/*.spec.ts'],
    running: ['./tests/running/**/*.spec.ts'],
    offline: ['./tests/offline/**/*.spec.ts'],
    bonus: ['./tests/bonus/**/*.spec.ts'],
    withdraw: ['./tests/withdraw/**/*.spec.ts'],
    push: ['./tests/push/**/*.spec.ts'],
    fraud: ['./tests/fraud/**/*.spec.ts'],
  },

  maxInstances: 1,
  capabilities: [androidCapabilities()],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 180000,
  connectionRetryCount: 2,

  services: [
    [
      'appium',
      {
        command: 'appium',
        args: {
          relaxedSecurity: true,
        },
      },
    ],
  ],

  framework: 'mocha',
  reporters: [
    'spec',
    [
      'allure',
      {
        outputDir: 'reports/allure-results',
        disableWebdriverStepsReporting: false,
        disableWebdriverScreenshotsReporting: false,
      },
    ],
    [path.join(root, 'reporters', 'runbonus-reporter.ts'), {}],
  ],

  mochaOpts: {
    ui: 'bdd',
    timeout: 300000,
  },

  afterTest: async (test, _context, { error }) => {
    if (error) {
      const id = test.title.replace(/\s+/g, '_');
      const file = path.join(root, 'screenshots', `${id}_${Date.now()}.png`);
      await driver.saveScreenshot(file);
    }
  },

  onComplete: async () => {
    const { buildSummaryReport } = await import('./helpers/reportHelper');
    buildSummaryReport();
  },
};

export const config: Options.Testrunner = {
  ...baseConfig,
};
