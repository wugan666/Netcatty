import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelTerminalThemeUpdate,
  resetTerminalThemeSchedulerForTests,
  scheduleTerminalThemeUpdate,
} from './terminalThemeScheduler';
import type { TerminalTheme } from '../../domain/models';

const theme = (id: string): TerminalTheme => ({
  id,
  name: id,
  type: 'dark',
  colors: {
    background: '#111111',
    foreground: '#eeeeee',
    cursor: '#22aaff',
    selection: '#22aaff44',
    black: '#000',
    red: '#000',
    green: '#000',
    yellow: '#000',
    blue: '#000',
    magenta: '#000',
    cyan: '#000',
    white: '#fff',
    brightBlack: '#000',
    brightRed: '#000',
    brightGreen: '#000',
    brightYellow: '#000',
    brightBlue: '#000',
    brightMagenta: '#000',
    brightCyan: '#000',
    brightWhite: '#fff',
  },
});

test('cancelTerminalThemeUpdate drops a pending hidden-pane theme flush', async () => {
  resetTerminalThemeSchedulerForTests();
  let appliedThemeId: string | null = null;
  const fakeTerm = {
    options: { theme: {} as Record<string, string> },
  };

  scheduleTerminalThemeUpdate(
    'session-1',
    theme('old-theme'),
    { visible: false, focused: false },
    () => fakeTerm as never,
  );

  cancelTerminalThemeUpdate('session-1');

  await new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });

  appliedThemeId = fakeTerm.options.theme.background ?? null;
  assert.equal(appliedThemeId, null);
});

test('hidden terminal theme updates do not wait for browser idle time', async () => {
  resetTerminalThemeSchedulerForTests();
  const fakeTerm = {
    options: { theme: {} as Record<string, string> },
  };

  scheduleTerminalThemeUpdate(
    'session-2',
    theme('new-theme'),
    { visible: false, focused: false },
    () => fakeTerm as never,
  );

  await Promise.resolve();
  assert.equal(fakeTerm.options.theme.background, '#111111');
});

test('re-applying identical colors does not touch the xterm theme again', async () => {
  resetTerminalThemeSchedulerForTests();
  const { applyTerminalThemeSync } = await import('./terminalThemeScheduler');
  let assignments = 0;
  let current: Record<string, string> = {};
  const fakeTerm = {
    options: {
      get theme() { return current; },
      set theme(value: Record<string, string>) { assignments += 1; current = value; },
    },
  };

  applyTerminalThemeSync(fakeTerm as never, theme('same'));
  // A tab switch re-runs the sync with an equal (but not identical) theme object.
  applyTerminalThemeSync(fakeTerm as never, theme('same'));
  assert.equal(assignments, 1);

  const recolored = theme('same');
  recolored.colors.red = '#ff0000';
  applyTerminalThemeSync(fakeTerm as never, recolored);
  assert.equal(assignments, 2);
  assert.equal(current.red, '#ff0000');
});
