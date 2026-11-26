/** POSIX single-quote escaping for remote shell commands built in the renderer. */
export function shQuote(str: string): string {
  return `'${String(str).replace(/'/g, "'\"'\"'")}'`;
}

const CLEAR_STARTUP_OUTPUT = "printf '\\033[H\\033[2J\\033[3J';";

export function buildTmuxAttachCommand(
  sessionName: string,
  windowIndex?: number,
  options?: {
    /**
     * Open as a regular tab rather than a throwaway popup: keep the login
     * shell underneath (detaching returns to a prompt instead of ending the
     * session) and turn on tmux mouse support for this session so the wheel
     * scrolls tmux history. tmux owns the scrollback while attached — the
     * terminal only ever sees the current screen — so without mouse mode
     * there is nothing to scroll up through.
     */
    tab?: boolean;
  },
): string {
  const target = windowIndex !== undefined
    ? `${shQuote(sessionName)}:${windowIndex}`
    : shQuote(sessionName);
  if (options?.tab) {
    return `${CLEAR_STARTUP_OUTPUT} tmux set-option -t ${shQuote(sessionName)} mouse on \\; attach -t ${target}`;
  }
  return `${CLEAR_STARTUP_OUTPUT} exec tmux attach -t ${target}`;
}
