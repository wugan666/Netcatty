const REMOTE_CLIPBOARD_IMAGE_DIR = ".netcatty-paste-images";

type ClipboardImageFile = {
  path: string;
  name: string;
  mediaType: string;
  size?: number;
};

export type RemoteClipboardImageBridge = Pick<
  NetcattyBridge,
  "readClipboardImage" | "openSftpForSession" | "startStreamTransfer"
> & Pick<Partial<NetcattyBridge>, "closeSftp" | "deleteTempFile" | "getSftpHomeDir">;

type TerminalLike = {
  focus?: () => void;
  modes?: { bracketedPasteMode?: boolean };
  options?: { ignoreBracketedPasteMode?: boolean };
};

const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

/**
 * Wrap the uploaded image path as a bracketed paste when the remote program
 * asked for it. Agent CLIs (Claude Code, Codex, …) only turn an image path
 * into an attachment when it arrives as a *paste*; the same bytes delivered
 * as plain keystrokes are inserted as literal text. Mirrors xterm's own
 * `paste()` gating so "disable bracketed paste" keeps working.
 */
export function wrapRemoteImagePathForPaste(pastedPath: string, term?: TerminalLike | null): string {
  const bracketed =
    term?.modes?.bracketedPasteMode === true && term.options?.ignoreBracketedPasteMode !== true;
  return bracketed ? `${BRACKETED_PASTE_START}${pastedPath}${BRACKETED_PASTE_END}` : pastedPath;
}

type HandleRemoteClipboardImagePasteOptions = {
  bridge?: RemoteClipboardImageBridge;
  createTransferId?: () => string;
  getRemoteCwd: () => Promise<string | null | undefined>;
  isSensitiveInput?: () => boolean;
  scrollToBottomAfterProgrammaticInput?: (data: string) => void;
  sessionId: string | null | undefined;
  terminalBackend: {
    writeToSession: (sessionId: string, data: string, options?: { automated?: boolean; sensitive?: boolean }) => void;
  };
  term?: TerminalLike | null;
};

export type RemoteClipboardImageUploadResult =
  | { ok: true; remotePath: string; pastedPath: string }
  | { ok: false; reason: "unsupported" | "no-session" | "no-image" | "no-cwd" | "upload-failed" };

export function getRemoteClipboardImageUploadErrorMessageKey(
  result: RemoteClipboardImageUploadResult,
): "terminal.clipboardImageUpload.noImage" | "terminal.clipboardImageUpload.failed" | null {
  if (result.ok === true) return null;
  return result.reason === "no-image"
    ? "terminal.clipboardImageUpload.noImage"
    : "terminal.clipboardImageUpload.failed";
}

const shellSafePathPattern = /^[A-Za-z0-9_./~:@%+=,-]+$/;

export function sanitizeRemoteClipboardImageName(name: string): string {
  const fallback = "netcatty-paste.png";
  const trimmed = name.trim() || fallback;
  const sanitized = trimmed
    .replace(/[\0/\\]/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || fallback;
}

export function buildRemoteClipboardImagePath(cwd: string | null | undefined, fileName: string): string {
  const safeFileName = sanitizeRemoteClipboardImageName(fileName);
  const normalizedCwd = typeof cwd === "string" ? cwd.trim() : "";
  if (!normalizedCwd) return "";
  const base = normalizedCwd.replace(/\/+$/g, "") || "/";

  if (base === "/") {
    return `/${REMOTE_CLIPBOARD_IMAGE_DIR}/${safeFileName}`;
  }

  return `${base}/${REMOTE_CLIPBOARD_IMAGE_DIR}/${safeFileName}`;
}

export function quoteRemotePathForShell(remotePath: string): string {
  if (shellSafePathPattern.test(remotePath)) return remotePath;
  return `'${remotePath.replace(/'/g, "'\\''")}'`;
}

function defaultTransferId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `clipboard-image-${uuid}` : `clipboard-image-${Date.now()}`;
}

export async function handleRemoteClipboardImageUpload({
  bridge,
  createTransferId = defaultTransferId,
  getRemoteCwd,
  isSensitiveInput,
  scrollToBottomAfterProgrammaticInput,
  sessionId,
  terminalBackend,
  term,
}: HandleRemoteClipboardImagePasteOptions): Promise<RemoteClipboardImageUploadResult> {
  if (!sessionId) return { ok: false, reason: "no-session" };
  if (!bridge?.readClipboardImage || !bridge.openSftpForSession || !bridge.startStreamTransfer) {
    return { ok: false, reason: "unsupported" };
  }

  let image: ClipboardImageFile | null;
  try {
    image = await bridge.readClipboardImage();
  } catch {
    // A clipboard read failure is indistinguishable from an empty clipboard —
    // treat it as "no image" so callers can fall back to a normal paste.
    return { ok: false, reason: "no-image" };
  }
  if (!image?.path || !image.name) return { ok: false, reason: "no-image" };

  let sftpId: string | undefined;
  try {
    const remoteCwd = await getRemoteCwd().catch(() => undefined);
    const transferId = createTransferId();

    sftpId = await bridge.openSftpForSession(sessionId);
    let targetPath = buildRemoteClipboardImagePath(remoteCwd, image.name);
    if (!targetPath && bridge.getSftpHomeDir) {
      // The shell cwd cannot always be resolved (a full-screen agent CLI owns
      // the prompt, cwd probing is disabled for the host, …). Fall back to the
      // login directory so the paste still works instead of failing outright.
      const home = await bridge.getSftpHomeDir(sftpId).catch(() => null);
      const homeDir = home?.success && home.homeDir?.startsWith("/") ? home.homeDir : undefined;
      targetPath = buildRemoteClipboardImagePath(homeDir, image.name);
    }
    if (!targetPath) return { ok: false, reason: "no-cwd" };
    const transferResult = await bridge.startStreamTransfer({
      transferId,
      sourcePath: image.path,
      targetPath,
      sourceType: "local",
      targetType: "sftp",
      targetSftpId: sftpId,
      totalBytes: image.size,
    });
    if (!transferResult || transferResult.error) return { ok: false, reason: "upload-failed" };

    const pastedPath = quoteRemotePathForShell(targetPath);
    terminalBackend.writeToSession(sessionId, wrapRemoteImagePathForPaste(pastedPath, term), {
      sensitive: isSensitiveInput?.() === true,
    });
    scrollToBottomAfterProgrammaticInput?.(pastedPath);
    term?.focus?.();
    return { ok: true, remotePath: targetPath, pastedPath };
  } finally {
    if (sftpId && bridge.closeSftp) {
      await bridge.closeSftp(sftpId).catch(() => undefined);
    }
    if (bridge.deleteTempFile) {
      await bridge.deleteTempFile(image.path).catch(() => undefined);
    }
  }
}
