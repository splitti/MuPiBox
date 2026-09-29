// Magic-link entry to the Eltern-WebApp. Triggered from the Settings page
// (the parent-only area reached by the 10×-tap on the status button). The
// previous Cloud+Battery tap-gesture trigger was removed — it was a hidden,
// hard-to-perform sequence that collided with the settings easter-egg on the
// same button. The fullscreen overlay component renders the signals below.

import { Injectable, signal } from '@angular/core'
import QRCode from 'qrcode'

const OVERLAY_TIMEOUT_S = 60

// The app on the phone: http://<box LAN IP>/app - port 80, where the web server passes /app to the app
// (config/lighttpd/90-mupibox-app.conf), the address the parents know from the start page. Was port 8200.

@Injectable({ providedIn: 'root' })
export class ElternMagicLinkService {
  private countdownTimer: ReturnType<typeof setTimeout> | null = null

  /** Whether the overlay is currently shown. Read by the overlay component. */
  readonly visible = signal(false)
  /** Plain magic-link URL (also rendered as text fallback for parents whose
   *  smartphone camera fails to scan the QR). */
  readonly magicLinkUrl = signal<string | null>(null)
  /** QR-Code as a data: URL (loaded as <img src>). Generated client-side so
   *  it encodes the box LAN IP, not the kiosk localhost. */
  readonly qrUrl = signal<string | null>(null)
  /** Remaining seconds before auto-close. UI shows this as a countdown. */
  readonly countdownSeconds = signal(OVERLAY_TIMEOUT_S)

  /**
   * Request a single-use magic link and show it as a fullscreen QR overlay.
   * `host` must be the box's LAN IP (the Settings page reads it from the
   * network signal) so the encoded URL is reachable from the parent's phone —
   * `location.host` would be the kiosk's localhost:8200 and useless off-box.
   */
  async generateAndShow(host: string | undefined): Promise<void> {
    if (!host) {
      console.warn('[eltern-magic-link] no LAN IP available — cannot build a phone-reachable link')
      return
    }
    try {
      const res = await fetch('/api/app/magic-link/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'settings-qr' }),
      })
      // A login link is only made on the box itself (the backend refuses it from other devices, e.g. this page
      // shown in the admin interface's browser view). Then the plain address of the app is shown: it asks for the
      // password - instead of the tap doing nothing at all.
      let url = `http://${host}/app`
      if (res.ok) {
        // (https when "Nur sichere Verbindung" is on, and the name set for links - e.g. an own certificate's)
        const body = (await res.json()) as { token: string; scheme?: string; link_host?: string | null }
        url = `${body.scheme === 'https' ? 'https' : 'http'}://${body.link_host || host}/app?token=${encodeURIComponent(body.token)}`
      } else {
        console.warn('[eltern-magic-link] no login link (status', res.status, ') - showing the plain address')
      }
      const qrDataUrl = await QRCode.toDataURL(url, { margin: 2, width: 320 })
      this.magicLinkUrl.set(url)
      this.qrUrl.set(qrDataUrl)
      this.visible.set(true)
      this.startCountdown()
    } catch (err) {
      console.error('[eltern-magic-link] generate threw:', err)
    }
  }

  /** Manually close the overlay (X button or backdrop click). Idempotent. */
  close(): void {
    this.visible.set(false)
    this.magicLinkUrl.set(null)
    this.qrUrl.set(null)
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer)
      this.countdownTimer = null
    }
  }

  private startCountdown(): void {
    this.countdownSeconds.set(OVERLAY_TIMEOUT_S)
    const tick = (): void => {
      const left = this.countdownSeconds() - 1
      if (left <= 0) {
        this.close()
        return
      }
      this.countdownSeconds.set(left)
      this.countdownTimer = setTimeout(tick, 1000)
    }
    this.countdownTimer = setTimeout(tick, 1000)
  }
}
