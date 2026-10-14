export const environment = {
  production: true,
  backend: {
    // the address the page came from: the kiosk's http://localhost:8200 as before, and the app's preview of the texts
    // on the display (a frame of https://<box>/app) through the app's own address - a fixed http://<box>:8200 is
    // blocked in a page opened with https, the preview then knew no theme and no texts
    apiUrl: `${window.location.origin}/api`,
    // the player listens on the box itself only; from another device (the admin interface's display page) through
    // the API, which checks the login (backend-api server.ts /api/player)
    playerUrl: /^(localhost|127\.[\d.]+|\[::1\])$/.test(window.location.hostname)
      ? `http://${window.location.hostname}:5005`
      : `${window.location.origin}/api/player`,
  },
}
