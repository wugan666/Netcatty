import assert from "node:assert/strict";
import test from "node:test";

import {
  QUIET_TAB_REVEAL_MAX_HIDDEN_MS,
  canRevealWithoutAtlasRebuild,
  getWebglContextEpoch,
  noteWebglContextChurn,
} from "./webglContextEpoch";

test("a short hide always takes the cheap reveal", () => {
  assert.equal(
    canRevealWithoutAtlasRebuild({ hiddenDurationMs: 500, shortHideMs: 3000, epochAtHide: null }),
    true,
  );
});

test("a longer hide stays cheap only while no WebGL context churned", () => {
  const epochAtHide = getWebglContextEpoch();
  assert.equal(
    canRevealWithoutAtlasRebuild({ hiddenDurationMs: 60_000, shortHideMs: 3000, epochAtHide }),
    true,
  );
  noteWebglContextChurn();
  assert.equal(
    canRevealWithoutAtlasRebuild({ hiddenDurationMs: 60_000, shortHideMs: 3000, epochAtHide }),
    false,
  );
});

test("very long hides and unknown hide epochs rebuild the atlas", () => {
  const epochAtHide = getWebglContextEpoch();
  assert.equal(
    canRevealWithoutAtlasRebuild({
      hiddenDurationMs: QUIET_TAB_REVEAL_MAX_HIDDEN_MS,
      shortHideMs: 3000,
      epochAtHide,
    }),
    false,
  );
  assert.equal(
    canRevealWithoutAtlasRebuild({ hiddenDurationMs: 60_000, shortHideMs: 3000, epochAtHide: null }),
    false,
  );
  assert.equal(
    canRevealWithoutAtlasRebuild({
      hiddenDurationMs: Number.POSITIVE_INFINITY,
      shortHideMs: 3000,
      epochAtHide,
    }),
    false,
  );
});
