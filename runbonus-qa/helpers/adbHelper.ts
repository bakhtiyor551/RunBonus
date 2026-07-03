import { execSync } from 'child_process';
import { config } from './config';

function adb(cmd: string): string {
  return execSync(`adb -s ${config.deviceName} ${cmd}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

export function adbShell(command: string): string {
  return adb(`shell ${command}`);
}

/** Отключить Wi-Fi и мобильные данные. */
export function disableNetwork(): void {
  try {
    adbShell('svc wifi disable');
    adbShell('svc data disable');
  } catch {
    adbShell('settings put global airplane_mode_on 1');
    adbShell('am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true');
  }
}

/** Включить сеть. */
export function enableNetwork(): void {
  try {
    adbShell('svc wifi enable');
    adbShell('svc data enable');
  } catch {
    adbShell('settings put global airplane_mode_on 0');
    adbShell('am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false');
  }
}

/** Отключить GPS (mock location off + location mode off). */
export function disableGps(): void {
  adbShell('settings put secure location_mode 0');
}

/** Включить GPS. */
export function enableGps(): void {
  adbShell('settings put secure location_mode 3');
}

/** Перезапуск приложения. */
export function restartApp(): void {
  adbShell(`am force-stop ${config.appPackage}`);
  adbShell(
    `am start -n ${config.appPackage}/${config.appActivity}`
  );
}

/** Очистить данные приложения. */
export function clearAppData(): void {
  adbShell(`pm clear ${config.appPackage}`);
}

export function getDeviceId(): string {
  return config.deviceName;
}
