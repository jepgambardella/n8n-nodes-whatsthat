# @jep182/n8n-nodes-whatsthat

WhatsThat lets you connect one or more WhatsApp numbers inside n8n, link chats or groups with simple names, send messages, and react to incoming events.

You will mainly use:

- `WhatsThat`
- `WhatsThat Trigger`

You also need one credential:

- `WhatsThat Runtime`

## Before You Start

Create `WhatsThat Runtime` credentials and choose a persistent storage path, for example:

```text
/home/node/.n8n/whatsthat
```

This folder is used to store session files and local metadata.

## How To Connect Your Number

1. Add a `WhatsThat` node.
2. Set `Resource` to `Session`.
3. Set `Operation` to `Connect Session`.
4. Fill in:
   - `Session Name`: a stable internal name like `main-phone`
   - `Display Name`: a friendly label like `Luca phone`
   - `WhatsApp Number`: optional, only if you want a pairing code instead of relying only on QR
5. Run the node.
6. In the output, open `qrCodeUrl`.

Open `qrCodeUrl` as the standard and recommended way to connect the number.

Important:

- open `qrCodeUrl` whenever possible
- do not rely on `pairingCode`
- `pairingCode` is not stable and may fail or stop working depending on the session state and device behavior
- `qrDataUrl` is available only if you specifically need the raw embedded QR image data

Example:

```text
Session Name: main-phone
Display Name: Luca phone
WhatsApp Number: 393331234567
```

## How To Wait Until The Number Is Fully Connected

After `Connect Session`, add another `WhatsThat` node:

1. Set `Resource` to `Session`
2. Set `Operation` to `Wait Until Connect`
3. Use the same `Session Name`
4. Choose how many seconds to wait in `Timeout Seconds`

This second node waits for the already-started session to become fully connected.

## How To Link A Group Or Chat Manually

1. Add a `WhatsThat` node
2. Set `Resource` to `Linked Chat`
3. Start with `Operation = List Discovered Chats`
4. Pick the chat or group you want to use
5. Change to `Operation = Link Chat`
6. Fill in:
   - `Session Name`
   - `Chat JID`
   - `Linked Chat`: the simple name you want to use later, for example `support` or `team`

Example:

```text
Linked Chat: support
```

After that, you can send messages by choosing that linked chat instead of writing the raw JID every time.

## How To Link A Group Or Chat From WhatsApp

Use `WhatsThat Trigger`.

1. Add a `WhatsThat Trigger` node
2. Select the same `Session Name`
3. Set `Event` to `Link Chat Command`
4. Leave the default command or change it

By default, users can send a message like:

```text
/link-whatsthat support
```

If that message is sent inside a group or chat, WhatsThat links that conversation with alias `support`.

This is useful when you want users to self-register a group without opening n8n.

## How To Send A Message To A Linked Chat

1. Add a `WhatsThat` node
2. Set `Resource` to `Send Message`
3. Set `Session Name`
4. Set `Send Message To` to `Linked Chat`
5. Choose a linked chat from the dropdown
6. Choose `Message Type`
7. Write the message

Example:

```text
Send Message To: Linked Chat
Linked Chat: support
Message Type: Text
Message: Hello from n8n
```

## How To Send A Message To A Number

1. Add a `WhatsThat` node
2. Set `Resource` to `Send Message`
3. Set `Send Message To` to `WhatsApp Number`
4. Enter the number with country code, digits only, without `00` and without `+`

Example:

```text
WhatsApp Number: 393331234567
```

## How To Send A Message To Yourself

1. Add a `WhatsThat` node
2. Set `Resource` to `Send Message`
3. Set `Send Message To` to `Yourself`

WhatsThat uses the number already connected for that session.

This is useful for testing.

## How To Send Media

For images and videos you can choose:

- `Native Media`
- `As File`

Use `Media URL` for the file you want to send.

Examples:

- send an image preview normally
- send a PDF as a document
- send a video as a file attachment

## How To Receive Events

Use `WhatsThat Trigger` when you want to react to:

- incoming messages
- your own sent messages
- pairing events
- connection events
- group updates

Common examples:

- start a workflow when a message arrives
- auto-link a chat with `/link-whatsthat support`
- continue a workflow when a session becomes connected

## Example Workflow

You can import this example:

- [`examples/register-number.workflow.json`](./examples/register-number.workflow.json)

It shows the basic flow:

1. `Connect Session`
2. `Wait Until Connect`

## Notes

- Use one persistent n8n instance as the owner of these sessions
- Keep the runtime storage path persistent
- If n8n restarts, active in-memory sockets are restarted from the saved session files

## Thanks

This project uses [Baileys](https://github.com/WhiskeySockets/Baileys).

## License

MIT
