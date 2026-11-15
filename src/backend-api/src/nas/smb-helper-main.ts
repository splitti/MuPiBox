// Entry of nas-smb-helper.js (see smb-helper.ts): started by the server with the mount point and a token, prints the
// port it listens on, and ends with the server (its stdin closes).

import { startSmbHelper } from './smb-helper'

const root = process.env.MUPIBOX_SMB_ROOT ?? ''
const token = process.env.MUPIBOX_SMB_TOKEN ?? ''
delete process.env.MUPIBOX_SMB_TOKEN

if (!root || token.length < 16) {
  console.error('nas-smb-helper: MUPIBOX_SMB_ROOT and MUPIBOX_SMB_TOKEN are required')
  process.exit(2)
}

startSmbHelper(root, token, 0, { requireMount: true })
  .then((server) => {
    const address = server.address()
    process.stdout.write(`port=${typeof address === 'object' && address ? address.port : 0}\n`)
  })
  .catch((error) => {
    console.error(`nas-smb-helper: ${error}`)
    process.exit(1)
  })

process.stdin.on('end', () => process.exit(0))
process.stdin.on('error', () => process.exit(0))
process.stdin.resume()
