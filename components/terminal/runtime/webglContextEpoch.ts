/**
 * Process-wide counter of WebGL renderer churn (a context being created or
 * lost in any terminal pane).
 *
 * Revealing a pane that sat hidden used to clear the glyph atlas every time,
 * because another pane creating a context — or the GPU dropping one — can
 * leave a hidden pane's cached glyphs corrupted. Re-rasterizing every visible
 * glyph on each tab switch is the bulk of the switch cost, though, and when no
 * context changed while the pane was hidden there is nothing to recover from.
 * Panes snapshot this epoch when they hide and only pay for the atlas rebuild
 * if it moved.
 */
let epoch = 0;

export const noteWebglContextChurn = (): void => {
  epoch += 1;
};

export const getWebglContextEpoch = (): number => epoch;

/** Longest hide that can still take the cheap reveal when nothing churned. */
export const QUIET_TAB_REVEAL_MAX_HIDDEN_MS = 10 * 60 * 1000;

export const canRevealWithoutAtlasRebuild = ({
  hiddenDurationMs,
  shortHideMs,
  epochAtHide,
  currentEpoch = epoch,
}: {
  hiddenDurationMs: number;
  shortHideMs: number;
  epochAtHide: number | null;
  currentEpoch?: number;
}): boolean => {
  if (hiddenDurationMs < shortHideMs) return true;
  if (epochAtHide === null || epochAtHide !== currentEpoch) return false;
  return hiddenDurationMs < QUIET_TAB_REVEAL_MAX_HIDDEN_MS;
};
