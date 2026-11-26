/**
 * Ask the main window to open a regular terminal tab that reuses an existing
 * session's connection and runs one command (e.g. `tmux attach`). Side panels
 * use this instead of a detached popup so the result behaves exactly like any
 * other tab: same shortcuts, paste, context menu, splits and session restore.
 */
export const OPEN_SESSION_COMMAND_TAB_EVENT = 'netcatty:open-session-command-tab';

export type OpenSessionCommandTabDetail = {
  sourceSessionId: string;
  startupCommand: string;
  title?: string;
  /** Set by the listener that opened the tab; unset means nobody handled it. */
  handled?: boolean;
};

/** Returns true when a main-window listener opened the tab. */
export function requestSessionCommandTab(
  detail: Omit<OpenSessionCommandTabDetail, 'handled'>,
): boolean {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return false;
  const payload: OpenSessionCommandTabDetail = { ...detail };
  window.dispatchEvent(new CustomEvent(OPEN_SESSION_COMMAND_TAB_EVENT, { detail: payload }));
  return payload.handled === true;
}
