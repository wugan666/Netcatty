import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRemoteClipboardImagePath,
  getRemoteClipboardImageUploadErrorMessageKey,
  handleRemoteClipboardImageUpload,
  quoteRemotePathForShell,
  wrapRemoteImagePathForPaste,
} from "./clipboardImagePaste";

test("remote clipboard image path is placed under the current directory", () => {
  assert.equal(
    buildRemoteClipboardImagePath("/srv/app", "netcatty paste:1.png"),
    "/srv/app/.netcatty-paste-images/netcatty_paste_1.png",
  );
});

test("remote clipboard image path is empty when cwd is unavailable", () => {
  assert.equal(
    buildRemoteClipboardImagePath(undefined, "shot.png"),
    "",
  );
});

test("remote paths are quoted for shell-safe insertion", () => {
  assert.equal(
    quoteRemotePathForShell("/srv/app/.netcatty-paste-images/a b's.png"),
    "'/srv/app/.netcatty-paste-images/a b'\\''s.png'",
  );
});

test("remote clipboard image upload inserts the remote image path without broadcasting", async () => {
  const writes: Array<{ sessionId: string; data: string; sensitive?: boolean }> = [];
  const scrolled: string[] = [];
  let focused = false;
  let closedSftpId: string | undefined;
  let deletedTempFile: string | undefined;
  const transferPayloads: unknown[] = [];
  const broadcastData: string[] = [];

  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => ({
        path: "/tmp/netcatty/shot.png",
        name: "shot 1.png",
        mediaType: "image/png",
        size: 12,
      }),
      openSftpForSession: async (sessionId) => {
        assert.equal(sessionId, "session-1");
        return "sftp-1";
      },
      startStreamTransfer: async (options) => {
        transferPayloads.push(options);
        return { transferId: options.transferId, totalBytes: 12 };
      },
      closeSftp: async (sftpId) => {
        closedSftpId = sftpId;
      },
      deleteTempFile: async (filePath) => {
        deletedTempFile = filePath;
        return { success: true };
      },
    },
    createTransferId: () => "transfer-1",
    getRemoteCwd: async () => "/home/alice/project",
    isSensitiveInput: () => true,
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: (sessionId, data, options) => writes.push({
        sessionId,
        data,
        sensitive: options?.sensitive,
      }),
    },
    term: {
      focus: () => {
        focused = true;
      },
    },
    scrollToBottomAfterProgrammaticInput: (data) => scrolled.push(data),
  });

  assert.deepEqual(result, {
    ok: true,
    remotePath: "/home/alice/project/.netcatty-paste-images/shot_1.png",
    pastedPath: "/home/alice/project/.netcatty-paste-images/shot_1.png",
  });
  assert.deepEqual(transferPayloads, [
    {
      transferId: "transfer-1",
      sourcePath: "/tmp/netcatty/shot.png",
      targetPath: "/home/alice/project/.netcatty-paste-images/shot_1.png",
      sourceType: "local",
      targetType: "sftp",
      targetSftpId: "sftp-1",
      totalBytes: 12,
    },
  ]);
  assert.deepEqual(writes, [
    {
      sessionId: "session-1",
      data: "/home/alice/project/.netcatty-paste-images/shot_1.png",
      sensitive: true,
    },
  ]);
  assert.deepEqual(scrolled, ["/home/alice/project/.netcatty-paste-images/shot_1.png"]);
  assert.deepEqual(broadcastData, []);
  assert.equal(focused, true);
  assert.equal(closedSftpId, "sftp-1");
  assert.equal(deletedTempFile, "/tmp/netcatty/shot.png");
});

test("remote clipboard image upload reports no image when no image exists", async () => {
  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => null,
      openSftpForSession: async () => "sftp-1",
      startStreamTransfer: async (options) => ({ transferId: options.transferId }),
    },
    getRemoteCwd: async () => "/home/alice",
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: () => assert.fail("should not paste without an image"),
    },
  });

  assert.deepEqual(result, { ok: false, reason: "no-image" });
});

test("remote clipboard image upload reports no image without inserting a path", async () => {
  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => null,
      openSftpForSession: async () => {
        assert.fail("should not open SFTP without an image");
      },
      startStreamTransfer: async (options) => ({ transferId: options.transferId }),
    },
    getRemoteCwd: async () => "/home/alice",
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: () => assert.fail("should not paste without an image"),
    },
  });

  assert.deepEqual(result, { ok: false, reason: "no-image" });
});

test("remote clipboard image upload skips upload without a reliable cwd", async () => {
  const transferPayloads: unknown[] = [];
  let deletedTempFile: string | undefined;

  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => ({
        path: "/tmp/netcatty/shot.png",
        name: "shot.png",
        mediaType: "image/png",
        size: 12,
      }),
      openSftpForSession: async () => "sftp-1",
      startStreamTransfer: async (options) => {
        transferPayloads.push(options);
        return { transferId: options.transferId };
      },
      getSftpHomeDir: async () => ({ success: false, error: "no home" }),
      deleteTempFile: async (filePath) => {
        deletedTempFile = filePath;
        return { success: true };
      },
    },
    getRemoteCwd: async () => undefined,
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: () => assert.fail("should not paste without upload"),
    },
  });

  assert.deepEqual(result, { ok: false, reason: "no-cwd" });
  assert.deepEqual(transferPayloads, []);
  assert.equal(deletedTempFile, "/tmp/netcatty/shot.png");
});

test("remote clipboard image upload does not insert a path when upload returns an error", async () => {
  let closedSftpId: string | undefined;
  let deletedTempFile: string | undefined;

  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => ({
        path: "/tmp/netcatty/shot.png",
        name: "shot.png",
        mediaType: "image/png",
        size: 12,
      }),
      openSftpForSession: async () => "sftp-1",
      startStreamTransfer: async (options) => ({ transferId: options.transferId, error: "disk full" }),
      closeSftp: async (sftpId) => {
        closedSftpId = sftpId;
      },
      deleteTempFile: async (filePath) => {
        deletedTempFile = filePath;
        return { success: true };
      },
    },
    getRemoteCwd: async () => "/home/alice",
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: () => assert.fail("should not paste failed upload path"),
    },
  });

  assert.deepEqual(result, { ok: false, reason: "upload-failed" });
  assert.equal(closedSftpId, "sftp-1");
  assert.equal(deletedTempFile, "/tmp/netcatty/shot.png");
});

test("remote clipboard image upload reports transfer failures without inserting a path", async () => {
  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => ({
        path: "/tmp/netcatty/shot.png",
        name: "shot.png",
        mediaType: "image/png",
        size: 12,
      }),
      openSftpForSession: async () => "sftp-1",
      startStreamTransfer: async (options) => ({ transferId: options.transferId, error: "disk full" }),
    },
    getRemoteCwd: async () => "/home/alice",
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: () => assert.fail("should not paste failed upload path"),
    },
  });

  assert.deepEqual(result, { ok: false, reason: "upload-failed" });
});

test("remote clipboard image upload treats clipboard read failures as no image", async () => {
  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => {
        throw new Error("clipboard unavailable");
      },
      openSftpForSession: async () => {
        assert.fail("should not open SFTP without an image");
      },
      startStreamTransfer: async (options) => ({ transferId: options.transferId }),
    },
    getRemoteCwd: async () => "/home/alice",
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: () => assert.fail("should not paste without an image"),
    },
  });

  assert.deepEqual(result, { ok: false, reason: "no-image" });
});

test("remote clipboard image upload result maps to user-facing message keys", () => {
  assert.equal(
    getRemoteClipboardImageUploadErrorMessageKey({
      ok: false,
      reason: "no-image",
    }),
    "terminal.clipboardImageUpload.noImage",
  );
  assert.equal(
    getRemoteClipboardImageUploadErrorMessageKey({
      ok: false,
      reason: "upload-failed",
    }),
    "terminal.clipboardImageUpload.failed",
  );
  assert.equal(
    getRemoteClipboardImageUploadErrorMessageKey({
      ok: true,
      remotePath: "/tmp/image.png",
      pastedPath: "/tmp/image.png",
    }),
    null,
  );
});

test("remote clipboard image upload falls back to the home directory when cwd is unknown", async () => {
  const writes: string[] = [];
  const transferTargets: string[] = [];

  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => ({
        path: "/tmp/netcatty/shot.png",
        name: "shot.png",
        mediaType: "image/png",
        size: 12,
      }),
      openSftpForSession: async () => "sftp-1",
      getSftpHomeDir: async (sftpId) => {
        assert.equal(sftpId, "sftp-1");
        return { success: true, homeDir: "/home/alice" };
      },
      startStreamTransfer: async (options) => {
        transferTargets.push(options.targetPath);
        return { transferId: options.transferId };
      },
    },
    getRemoteCwd: async () => {
      throw new Error("cwd probe failed");
    },
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: (_sessionId, data) => writes.push(data),
    },
  });

  const expected = "/home/alice/.netcatty-paste-images/shot.png";
  assert.deepEqual(result, { ok: true, remotePath: expected, pastedPath: expected });
  assert.deepEqual(transferTargets, [expected]);
  assert.deepEqual(writes, [expected]);
});

test("remote clipboard image path is sent as a bracketed paste when the remote program enabled it", async () => {
  const writes: string[] = [];
  const scrolled: string[] = [];

  const result = await handleRemoteClipboardImageUpload({
    bridge: {
      readClipboardImage: async () => ({
        path: "/tmp/netcatty/shot.png",
        name: "shot.png",
        mediaType: "image/png",
        size: 12,
      }),
      openSftpForSession: async () => "sftp-1",
      startStreamTransfer: async (options) => ({ transferId: options.transferId }),
    },
    getRemoteCwd: async () => "/srv/app",
    scrollToBottomAfterProgrammaticInput: (data) => scrolled.push(data),
    sessionId: "session-1",
    terminalBackend: {
      writeToSession: (_sessionId, data) => writes.push(data),
    },
    // Agent CLIs (Claude Code, Codex) only attach an image path that arrives
    // as a paste; plain keystrokes are inserted as literal text.
    term: { modes: { bracketedPasteMode: true }, options: {} },
  });

  const remotePath = "/srv/app/.netcatty-paste-images/shot.png";
  assert.deepEqual(writes, [`\x1b[200~${remotePath}\x1b[201~`]);
  assert.deepEqual(scrolled, [remotePath]);
  assert.deepEqual(result, { ok: true, remotePath, pastedPath: remotePath });
});

test("remote image path paste wrapping follows the terminal bracketed paste state", () => {
  assert.equal(wrapRemoteImagePathForPaste("/a.png", null), "/a.png");
  assert.equal(wrapRemoteImagePathForPaste("/a.png", { modes: { bracketedPasteMode: false } }), "/a.png");
  assert.equal(
    wrapRemoteImagePathForPaste("/a.png", {
      modes: { bracketedPasteMode: true },
      options: { ignoreBracketedPasteMode: true },
    }),
    "/a.png",
  );
  assert.equal(
    wrapRemoteImagePathForPaste("/a.png", { modes: { bracketedPasteMode: true }, options: {} }),
    "\x1b[200~/a.png\x1b[201~",
  );
});
