import test from "node:test";
import assert from "node:assert/strict";

import {
  OPEN_SESSION_COMMAND_TAB_EVENT,
  requestSessionCommandTab,
  type OpenSessionCommandTabDetail,
} from "./sessionCommandTab";
import { createCopiedTerminalSessionClone } from "./terminalConnectionReuse";

test("requestSessionCommandTab reports whether a listener opened the tab", () => {
  const target = new EventTarget();
  const globals = globalThis as { window?: unknown };
  const previousWindow = globals.window;
  globals.window = target;
  try {
    assert.equal(
      requestSessionCommandTab({ sourceSessionId: "s1", startupCommand: "tmux attach" }),
      false,
    );

    const seen: OpenSessionCommandTabDetail[] = [];
    target.addEventListener(OPEN_SESSION_COMMAND_TAB_EVENT, (event) => {
      const detail = (event as CustomEvent<OpenSessionCommandTabDetail>).detail;
      seen.push({ ...detail });
      detail.handled = true;
    });
    assert.equal(
      requestSessionCommandTab({ sourceSessionId: "s1", startupCommand: "tmux attach", title: "tmux: main" }),
      true,
    );
    assert.deepEqual(seen, [{ sourceSessionId: "s1", startupCommand: "tmux attach", title: "tmux: main" }]);
  } finally {
    globals.window = previousWindow;
  }
});

test("a command tab clone reuses the source connection and carries its command and name", () => {
  const clone = createCopiedTerminalSessionClone(
    {
      id: "source",
      hostId: "h1",
      hostLabel: "prod",
      hostname: "10.0.0.1",
      username: "root",
      status: "connected",
      protocol: "ssh",
    } as never,
    { id: "clone", startupCommand: "tmux attach -t main", customName: "tmux: main" },
  );
  assert.equal(clone.startupCommand, "tmux attach -t main");
  assert.equal(clone.customName, "tmux: main");
  assert.equal(clone.reuseConnectionFromSessionId, "source");
  assert.equal(clone.pendingInitialCwd, undefined);
});
