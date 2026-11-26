import test from "node:test";
import assert from "node:assert/strict";

import { buildTmuxAttachCommand } from "./tmuxShell";

test("popup attach replaces the shell with tmux", () => {
  assert.match(buildTmuxAttachCommand("main"), /exec tmux attach -t 'main'$/);
  assert.match(buildTmuxAttachCommand("main", 2), /exec tmux attach -t 'main':2$/);
});

test("tab attach keeps the shell and enables wheel scrolling through tmux history", () => {
  const command = buildTmuxAttachCommand("my work", 1, { tab: true });
  // No exec: detaching returns to the login shell like any other tab.
  assert.equal(command.includes("exec tmux"), false);
  // tmux owns the scrollback while attached; mouse mode is what lets the
  // wheel scroll it. The escaped `;` chains both tmux commands in one call.
  assert.equal(command.endsWith(String.raw`tmux set-option -t 'my work' mouse on \; attach -t 'my work':1`), true);
});

test("tab attach quotes hostile session names", () => {
  const command = buildTmuxAttachCommand("a'; rm -rf ~; '", undefined, { tab: true });
  assert.equal(command.includes(`'a'"'"'; rm -rf ~; '"'"''`), true);
});
