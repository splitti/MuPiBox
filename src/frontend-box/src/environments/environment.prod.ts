export const environment = {
  production: true,
  backend: {
    apiUrl: `http://${window.location.hostname}:8200/api`,
    playerUrl: `http://${window.location.hostname}:5005`,
  },
  runsOnBox:
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::ffff:127.0.0.1' ||
    window.location.hostname === '::1' ||
    window.location.hostname === 'localhost',
}
