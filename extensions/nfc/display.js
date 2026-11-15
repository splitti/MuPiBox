// NFC-Reader on the display: a tag was laid on and the box knows its medium - the API part says so (GET /pending, once), and the display
// starts it the way a tap on a tile does (the player page, the tile times, the list of what was heard last). Nothing else of the
// display is touched.

export function activate(api) {
  let last = 0
  api.every(1000, async () => {
    const command = await api.fetchApi('/pending')
    if (!command || typeof command.seq !== 'number' || command.seq === last || !command.media) return
    last = command.seq
    api.player.open(command.media)
  })
}
