# @jep182/n8n-nodes-whatsthat

WhatsThat is an n8n community package for sending WhatsApp messages, with multiple sessions.

It lets you:

- manage multiple sessions and numbers
- connect with pairing code or QR
- discover chats and groups
- link chats/groups to friendly aliases
- send text, media, documents, reactions, contacts, locations, and polls
- receive inbound events through a trigger node

## Included Nodes

### `WhatsThat Session`

Use this node to:

- connect a session
- wait for a session to become connected
- list sessions
- inspect session status
- disconnect a session
- remove a session

When pairing is available, the node returns:

- `pairingCode`
- `qrCodeUrl`
- `qr`
- `qrDataUrl`

### `WhatsThat Targets`

Use this node to:

- list discovered chats and groups
- list linked aliases
- link a target to an alias
- unlink an alias

### `WhatsThat Message`

Use this node to send:

- text
- image
- video
- audio
- document
- reaction
- location
- contact
- poll

For images and videos, the node can decide internally whether to send them as:

- native media
- file/document attachment

### `WhatsThat Trigger`

Use this node to listen for:

- incoming messages
- your own sent messages
- session pairing events
- session connected/disconnected events
- group updates

## How It Works

WhatsThat embeds Baileys directly in n8n.

- session auth files are stored on disk
- session metadata and linked targets are stored as local JSON files under the runtime storage path

## Quick Start

1. Create `WhatsThat Runtime` credentials.
2. Set a storage path, for example:

```text
/home/node/.n8n/whatsthat
```

3. Add `WhatsThat Session`.
4. Choose `Connect Session`, then provide:
   - `Session ID (Internal)`: a stable unique ID such as `main-phone`
   - `Label (Visible Name)`: a human-readable name such as `Luca personal phone`
   - optional `Phone Number For Pairing`: full number with country code, digits only, without `00` or `+`
5. Run the node and use the returned `pairingCode`, `qrCodeUrl`, or `qrDataUrl` to connect the device.
6. Add another `WhatsThat Session` node with `Ensure Session`.
7. Set `Return When` to `Connected` so the workflow waits until the already-started session finishes pairing.
8. Use `WhatsThat Targets` to discover and link chats/groups.
9. Use `WhatsThat Message` to send messages by alias or raw JID.

Example workflow:

- [`examples/register-number.workflow.json`](./examples/register-number.workflow.json)

## Media Delivery

For `Image` and `Video` messages:

- `Native Media` sends them as normal media with preview
- `As File` sends them as a document/file attachment

## Notes

- This package runs an active WebSocket client inside n8n.
- For production, use persistent storage for the auth directory.
- Use one n8n instance as the runtime owner for these sessions.

## Thanks

This project relies on [Baileys](https://github.com/WhiskeySockets/Baileys), the open-source TypeScript/Node.js library that powers the messaging client layer.

Please review the Baileys project, its license, and its usage notes before running it in production:

- [Baileys repository](https://github.com/WhiskeySockets/Baileys)

## License

MIT
