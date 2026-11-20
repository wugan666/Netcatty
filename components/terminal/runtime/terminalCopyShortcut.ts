type CopyShortcutKeyEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey"
>;

function isPhysicalCKey(e: CopyShortcutKeyEvent): boolean {
  return e.key.toLowerCase() === "c" || e.code === "KeyC";
}

export function isPlainCtrlCInterruptChord(e: CopyShortcutKeyEvent): boolean {
  return e.ctrlKey
    && !e.shiftKey
    && !e.altKey
    && !e.metaKey
    && isPhysicalCKey(e);
}

function isPhysicalVKey(e: CopyShortcutKeyEvent): boolean {
  return e.key.toLowerCase() === "v" || e.code === "KeyV";
}

/** Plain Ctrl+V — the Windows Terminal / conhost paste chord. */
export function isPlainCtrlVPasteChord(e: CopyShortcutKeyEvent): boolean {
  return e.ctrlKey
    && !e.shiftKey
    && !e.altKey
    && !e.metaKey
    && isPhysicalVKey(e);
}

export type WindowsStyleClipboardKeyAction = "paste" | "copy" | null;

/**
 * Windows Terminal / conhost key feel (opt-in per platform, see
 * resolveWindowsStyleCopyPaste): plain Ctrl+V pastes, and plain Ctrl+C copies
 * while text is selected. Without a selection Ctrl+C stays an interrupt, so
 * this returns null and the normal SIGINT path runs.
 */
export function windowsStyleClipboardKeyAction(
  e: CopyShortcutKeyEvent,
  options: { enabled: boolean; hasSelection: boolean },
): WindowsStyleClipboardKeyAction {
  if (!options.enabled) return null;
  if (isPlainCtrlVPasteChord(e)) return "paste";
  if (options.hasSelection && isPlainCtrlCInterruptChord(e)) return "copy";
  return null;
}

/** macOS Cmd+C / Super+C — forward when there is no xterm selection. */
export function isPlainMetaCCopyChord(e: CopyShortcutKeyEvent): boolean {
  return e.metaKey
    && !e.ctrlKey
    && !e.shiftKey
    && !e.altKey
    && isPhysicalCKey(e);
}

/**
 * When copy matches with no xterm selection, pass the chord through instead of
 * consuming an empty clipboard write.
 *
 * - Ctrl+C → SIGINT (or Kitty Ctrl+C)
 * - Cmd+C → Kitty Super+C for nested TUIs (e.g. Herdr)
 *
 * Other no-selection copy bindings stay consumed as a safe no-op so keys like
 * F5 / Ctrl+L are not forwarded to the remote (#1461).
 */
export function shouldPassThroughCopyShortcut(
  action: string,
  hasSelection: boolean,
  e: CopyShortcutKeyEvent,
): boolean {
  return action === "copy"
    && !hasSelection
    && (isPlainCtrlCInterruptChord(e) || isPlainMetaCCopyChord(e));
}
