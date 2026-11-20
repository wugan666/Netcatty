import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTerminalSettings, resolveWindowsStyleCopyPaste } from "./models/terminal";

test("Windows-style copy/paste follows the platform until the user chooses", () => {
  assert.equal(normalizeTerminalSettings(undefined).windowsStyleCopyPaste, undefined);
  assert.equal(resolveWindowsStyleCopyPaste(undefined, true), true);
  assert.equal(resolveWindowsStyleCopyPaste(undefined, false), false);
  assert.equal(resolveWindowsStyleCopyPaste(false, true), false);
  assert.equal(resolveWindowsStyleCopyPaste(true, false), true);
  assert.equal(normalizeTerminalSettings({ windowsStyleCopyPaste: false }).windowsStyleCopyPaste, false);
});

test("clipboard images auto-upload on paste by default", () => {
  assert.equal(normalizeTerminalSettings(undefined).autoUploadClipboardImageOnPaste, true);
  assert.equal(
    normalizeTerminalSettings({ autoUploadClipboardImageOnPaste: false }).autoUploadClipboardImageOnPaste,
    false,
  );
});
