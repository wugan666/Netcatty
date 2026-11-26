import test from "node:test";
import assert from "node:assert/strict";

import {
  isCtrlShiftFChord,
  isTerminalControlChord,
  shouldPassControlChordToTerminal,
} from "./terminalControlChord";

const ev = (key: string, code: string, mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {}) => ({
  key,
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

test("plain Ctrl+letter chords belong to the terminal", () => {
  for (const [key, code] of [["w", "KeyW"], ["j", "KeyJ"], ["k", "KeyK"], ["b", "KeyB"], ["t", "KeyT"], ["f", "KeyF"], ["p", "KeyP"]]) {
    assert.equal(isTerminalControlChord(ev(key, code, { ctrlKey: true })), true, key);
  }
  // Non-Latin layouts report another character but keep the physical code.
  assert.equal(isTerminalControlChord(ev("ц", "KeyW", { ctrlKey: true })), true);
  assert.equal(isTerminalControlChord(ev("\\", "Backslash", { ctrlKey: true })), true);
  assert.equal(isTerminalControlChord(ev("_", "Minus", { ctrlKey: true })), true);
});

test("chords with extra modifiers or non-control keys stay app shortcuts", () => {
  assert.equal(isTerminalControlChord(ev("W", "KeyW", { ctrlKey: true, shiftKey: true })), false);
  assert.equal(isTerminalControlChord(ev("w", "KeyW", { ctrlKey: true, altKey: true })), false);
  assert.equal(isTerminalControlChord(ev("w", "KeyW", { metaKey: true })), false);
  assert.equal(isTerminalControlChord(ev("w", "KeyW")), false);
  assert.equal(isTerminalControlChord(ev("Tab", "Tab", { ctrlKey: true })), false);
  assert.equal(isTerminalControlChord(ev("1", "Digit1", { ctrlKey: true })), false);
  assert.equal(isTerminalControlChord(ev("=", "Equal", { ctrlKey: true })), false);
  assert.equal(isTerminalControlChord(ev(",", "Comma", { ctrlKey: true })), false);
});

test("control chords pass to the terminal only when the Windows feel is enabled", () => {
  const ctrlW = ev("w", "KeyW", { ctrlKey: true });
  assert.equal(shouldPassControlChordToTerminal(ctrlW, { enabled: true }), true);
  assert.equal(shouldPassControlChordToTerminal(ctrlW, { enabled: false }), false);
});

test("Ctrl+Shift+F is the find chord", () => {
  assert.equal(isCtrlShiftFChord(ev("F", "KeyF", { ctrlKey: true, shiftKey: true })), true);
  assert.equal(isCtrlShiftFChord(ev("f", "KeyF", { ctrlKey: true })), false);
  assert.equal(isCtrlShiftFChord(ev("F", "KeyF", { ctrlKey: true, shiftKey: true, altKey: true })), false);
});
