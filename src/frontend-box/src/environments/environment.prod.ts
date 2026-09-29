export const environment = {
  production: true,
  backend: {
    apiUrl: `http://${window.location.hostname}:8200/api`,
    // the player listens on the box itself only; from another device (the admin interface's display page) through
    // the API, which checks the login (backend-api server.ts /api/player)
    playerUrl: /^(localhost|127\.[\d.]+|\[::1\])$/.test(window.location.hostname)
      ? `http://${window.location.hostname}:5005`
      : `http://${window.location.hostname}:8200/api/player`,
  },
}
