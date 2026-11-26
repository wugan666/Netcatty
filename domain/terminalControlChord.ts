type ControlChordKeyEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey"
>;

// Non-letter keys whose plain Ctrl chord is a C0 control character a remote
// program can bind (Ctrl+\ = SIGQUIT, Ctrl+_ = undo, Ctrl+] / Ctrl+^ / Ctrl+@).
const TERMINAL_CONTROL_CHORD_KEYS = new Set(["[", "\\", "]", "^", "_", "@", "/", " "]);

/**
 * Plain Ctrl+<letter> (and the other C0 chords) with no Shift/Alt/Meta — the
 * keys readline and agent CLIs (Claude Code, Codex) bind themselves: Ctrl+W
 * delete word, Ctrl+J newline, Ctrl+K kill line, Ctrl+B background, Ctrl+T,
 * Ctrl+R, Ctrl+F, Ctrl+P… Windows Terminal never claims these; its own
 * shortcuts all carry Shift or Alt.
 */
export function isTerminalControlChord(e: ControlChordKeyEvent): boolean {
  if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return false;
  if (/^Key[A-Z]$/.test(e.code)) return true;
  if (/^[a-zA-Z]$/.test(e.key)) return true;
  return TERMINAL_CONTROL_CHORD_KEYS.has(e.key);
}

/**
 * Windows Terminal key feel: while the terminal has focus, plain Ctrl chords
 * belong to the remote program instead of app shortcuts (close tab, command
 * palette, quick switch, broadcast, search…). Those shortcuts keep working
 * outside the terminal and can be rebound to Ctrl+Shift combinations.
 */
export function shouldPassControlChordToTerminal(
  e: ControlChordKeyEvent,
  options: { enabled: boolean },
): boolean {
  return options.enabled && isTerminalControlChord(e);
}

/** Ctrl+Shift+F — Windows Terminal's find chord. */
export function isCtrlShiftFChord(e: ControlChordKeyEvent): boolean {
  return e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey
    && (e.code === "KeyF" || e.key.toLowerCase() === "f");
}
