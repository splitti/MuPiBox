// The NAS as the rest of the box sees it. One provider stands for one signed-in connection to a NAS (WebDAV or SMB);
// music, the folder index, local copies, covers and the photo display only talk to this interface, never to the
// protocol behind it. Paths are NAS paths: "/" + the folders, as the parents chose them in the app.

export interface NasFileEntry {
  name: string
  path: string
  isdir: boolean
  additional?: { size?: number }
  // changes when the file changes (WebDAV: ETag or last-modified date) - the key of thumbnails and covers
  version?: string
}

/** The login is no longer accepted (password changed, the NAS dropped the session): sign in again once. */
export class NasSessionExpiredError extends Error {}

/** The NAS answered, but with an error for this path (gone, no permission) - unlike a network failure it is not away. */
export class NasApiError extends Error {}

/** ok · exists (not written: a file is there and overwrite was off) · denied (no write permission) · failed */
export type NasWriteResult = 'ok' | 'exists' | 'denied' | 'failed'

export interface NasReadOptions {
  /** an HTTP Range value ("bytes=100-" / "bytes=100-199"): the answer is 206 with that part (or 200 when the NAS ignores it) */
  range?: string
  signal?: AbortSignal
}

export interface NasListOptions {
  /** only the subfolders are needed (the folder index): a provider may leave the files out, it need not */
  foldersOnly?: boolean
}

export interface NasProvider {
  readonly kind: 'webdav' | 'smb'
  /**
   * The children of a folder, system entries left out. Throws NasSessionExpiredError when the login is refused,
   * NasApiError when the NAS answers with an error for this folder; any other error means it did not answer.
   */
  list(folder: string, signal?: AbortSignal, options?: NasListOptions): Promise<NasFileEntry[]>
  /** Whether a folder exists (false: gone). Throws NasApiError on another answer, and when the NAS does not answer. */
  folderExists(folder: string, signal?: AbortSignal): Promise<boolean>
  /**
   * A file as an HTTP answer: 200 (whole) or 206 (range), 404 gone, 401/403 refused - with content-length,
   * content-range, content-type and accept-ranges where known. The body is the caller's to read or cancel.
   */
  read(file: string, options?: NasReadOptions): Promise<Response>
  /** Writes a file (covers chosen in the app or found online). Without overwrite an existing file stays: 'exists'. */
  write(file: string, data: Buffer, options: { contentType: string; overwrite: boolean; signal?: AbortSignal }): Promise<NasWriteResult>
  /** Renames a file (the cover before a new one is kept as cover-previous.*). */
  move(from: string, to: string, options: { overwrite: boolean; signal?: AbortSignal }): Promise<NasWriteResult>
  remove(file: string, signal?: AbortSignal): Promise<NasWriteResult>
}

// Not shown and not played: hidden files (macOS "._01.mp3" companions, ".DS_Store"), DSM's "@eaDir" thumbnail
// folders, recycle bin and snapshots.
export function nasIsSystemEntry(name: string): boolean {
  return name.startsWith('.') || name.startsWith('@') || name === '#recycle' || name === '#snapshot'
}
