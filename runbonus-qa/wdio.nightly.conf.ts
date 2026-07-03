import { baseConfig } from './wdio.conf';

/** Ночной прогон — все тесты. */
export const config = {
  ...baseConfig,
  specs: ['./tests/**/*.spec.ts'],
};
