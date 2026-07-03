import { baseConfig } from './wdio.conf';

/** Перед релизом — критические сьюты. */
export const config = {
  ...baseConfig,
  specs: [
    './tests/auth/**/*.spec.ts',
    './tests/gps/**/*.spec.ts',
    './tests/running/**/*.spec.ts',
    './tests/offline/**/*.spec.ts',
    './tests/bonus/**/*.spec.ts',
    './tests/fraud/**/*.spec.ts',
  ],
};
