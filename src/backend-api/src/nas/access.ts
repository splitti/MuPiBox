// The one way to the NAS: the signed-in provider, shared by all requests, and whether the NAS is away. After a failure
// the NAS is skipped for a short while, so the kids' screens fall back to the local copies at once instead of waiting
// on timeouts every time.

import { type NasProvider, NasSessionExpiredError } from './provider'

/** How a login made in the app reaches the NAS (shown in the app instead of the config's, which may be older). */
export interface NasLoginInfo {
  protocol: 'webdav' | 'smb'
  address: string
  https: boolean
  share: string
  domain: string
  account: string
}

export interface NasConnectResult {
  provider?: NasProvider
  /** the NAS did not answer at all: it is marked away for a while */
  unreachable?: boolean
}

export class NasAccess {
  private current: NasProvider | undefined
  private pending: Promise<NasProvider | undefined> | undefined
  private awayUntil = 0
  private lastWorking: NasProvider | undefined
  // bumped by use() and clear(): a sign-in that was under way before must not put its provider back after them
  private generation = 0
  // the login made in the app: used again after the NAS was away, instead of the remembered one of the config (that
  // may be older, or another protocol - a login without "merken" is not in the config at all)
  private pinned: { provider: NasProvider; info?: NasLoginInfo } | undefined

  /** connect: signs in with the remembered login (undefined provider: none remembered, refused, or away) */
  constructor(
    private readonly connect: () => Promise<NasConnectResult>,
    private readonly awayMs = 30000,
  ) {}

  /** The signed-in provider without signing in (undefined: none yet, or dropped after a failure). */
  get signedIn(): NasProvider | undefined {
    return this.current
  }

  /**
   * The last provider that worked. A stream keeps using it while the NAS is marked away: one slow folder listing
   * (another request) must not cut off the album that is playing - the stream has its own retries.
   */
  get last(): NasProvider | undefined {
    return this.lastWorking
  }

  /** Until when the NAS counts as away (ms since epoch; in the past: not away). */
  get awayUntilMs(): number {
    return this.awayUntil
  }

  isAway(now = Date.now()): boolean {
    return now < this.awayUntil
  }

  /** A request found the NAS not answering: skip it for a while, sign in anew after that. */
  markAway(): void {
    this.awayUntil = Date.now() + this.awayMs
    this.current = undefined
  }

  /** The login made in the app, while it is the box's (until signed off or restarted). */
  get appLogin(): NasLoginInfo | undefined {
    return this.pinned?.info
  }

  /** A login in the app worked: this provider from now on (until signed off or restarted), and the NAS is there. */
  use(provider: NasProvider, info?: NasLoginInfo): void {
    this.generation++
    this.pinned = { provider, info }
    this.current = provider
    this.lastWorking = provider
    this.awayUntil = 0
  }

  /** Signed off in the app. */
  clear(): void {
    this.generation++
    this.pinned = undefined
    this.current = undefined
    this.lastWorking = undefined
  }

  /** The signed-in provider, or a login with the remembered credentials (none while the NAS is away). */
  async active(): Promise<NasProvider | undefined> {
    if (this.current) {
      return this.current
    }
    if (this.isAway()) {
      return undefined
    }
    // Several requests often arrive at once (e.g. one per artist): share one login.
    if (!this.pending) {
      this.pending = this.signIn().finally(() => {
        this.pending = undefined
      })
    }
    return await this.pending
  }

  private async signIn(): Promise<NasProvider | undefined> {
    if (this.pinned) {
      // (the login of the app again: WebDAV signs in with every request anyway, SMB mounts again by itself)
      this.current = this.pinned.provider
      this.lastWorking = this.pinned.provider
      return this.current
    }
    const generation = this.generation
    const result = await this.connect()
    if (generation !== this.generation) {
      // (a login in the app or a sign-off came in the meantime: theirs counts)
      return this.current
    }
    if (!result.provider) {
      if (result.unreachable) this.markAway()
      return undefined
    }
    this.current = result.provider
    this.lastWorking = result.provider
    return result.provider
  }

  /** Runs fn with the active provider, once more with a fresh login when the login turned out to be refused. */
  async withSession<T>(fn: (provider: NasProvider) => Promise<T>): Promise<T | undefined> {
    let provider = await this.active()
    if (!provider) {
      return undefined
    }
    try {
      return await fn(provider)
    } catch (error) {
      if (error instanceof NasSessionExpiredError) {
        this.current = undefined
        provider = await this.active()
        if (!provider) {
          return undefined
        }
        return await fn(provider)
      }
      throw error
    }
  }
}
