# ETNProject

A hosted, browser-to-browser chat and cryptography lab for **Exploring the Networks**. Open a link on two computers, create or join a room, and exchange messages using a shared classical substitution key. No Python installation, login, database, or paid backend is required to use the hosted website.

## Creators and project authors

Co-created and co-authored by **[Kunal Chaudhary](https://github.com/kiingkunal)** and **[Jatin Dhiman](https://github.com/jatindhimangit)**.

Both are credited as project contributors and maintainers. Jatin is a repository collaborator with write access. See [AUTHORS.md](AUTHORS.md) for project credits and [CITATION.cff](CITATION.cff) for citation metadata. GitHub's automatic Contributors graph is calculated separately from commit history.

## Open the website

- **GitHub Pages:** https://kiingkunal.github.io/etnproject/

GitHub Pages uses the account's `kiingkunal.github.io` hostname and the repository's `/etnproject/` path. GitHub does not assign a project-only `etnproject.github.io` hostname to a repository under a different username. The product is branded **ETNProject**.

## Two-computer demonstration

1. Open the hosted address on both computers. Chrome, Edge, Firefox, or Safari with WebRTC support is required.
2. Prefer the same private Wi-Fi for a classroom demo. Internet is required to load the website and contact the signaling service.
3. On computer A, select **Vigenère**, enter `Alice`, and choose a shared keyword such as `SECRET`.
4. Click **Create a room**. Keep this tab open. Copy the room code or invite link.
5. On computer B, open the invite link or select **Join room** and enter the code.
6. Enter `Bob`, the same cipher, and the same keyword. Share the keyword separately from the invite link.
7. Click **Join the room**. Both screens should show **Connected**.
8. Send `Hello, World!`. With key `SECRET`, ciphertext is `Zincs, Pgvnu!`.
9. Reply from B. The sender's message should update to **Received by peer** after an acknowledgment arrives.
10. Click a message bubble to inspect original text, ciphertext, recovered text, the first 14 character substitutions, and the exact chat packet.

The sample button previews the cipher locally and is explicitly labeled **LAB SAMPLE · NOT SENT**. It does not simulate a connected chat or invent received messages.

To compare ciphers, disconnect and select another mode. Both people must use matching settings. A host keeps the room open after a guest disconnects or submits a mismatched key, allowing another connection attempt. One room accepts at most two participants.

## Cipher definitions

These are standard **A–Z classical ciphers**. Letter case is retained. Only ASCII English letters are substituted; digits, spaces, punctuation, emoji, and non-English characters pass through unchanged. Vigenère advances the key only for English letters and restarts the key at each message.

| Cipher | Key | Technique | Example |
| --- | --- | --- | --- |
| Vigenère (default) | A word of 1–64 A–Z letters | Repeat the key; each letter chooses a different Caesar shift, with A = 0. | `ATTACK AT DAWN` → `LXFOPV EF RNHR`, key `LEMON` |
| Caesar | Whole number 1–25 | Shift all English letters by the same amount. | `ROOM 204` → `WTTR 204`, key `5` |
| Monoalphabetic | A word of 1–64 A–Z letters | Deduplicate the key, append unused letters, then substitute by alphabet position. | `Hello Bob!` → `Aoffi Eie!`, key `NETWORK` |

Some cipher examples use a larger printable-character alphabet and transform digits and punctuation too. Those produce different outputs. This project deliberately uses the conventional 26-letter alphabet and documents its behavior. Keywords are case-insensitive. Identity keys (such as all-A Vigenère keys) are rejected.

## Networking architecture

```text
GitHub Pages / Sites ── HTTPS ──→ each browser loads the website

Browser A ←── WSS / HTTPS signaling via PeerJS Cloud ──→ Browser B
             connection details, not chat plaintext

Browser A ═════ reliable WebRTC data channel ═════ Browser B
plaintext → cipher → ciphertext       ciphertext → inverse cipher → plaintext
```

The hosting service serves static assets only. The free PeerJS Cloud signaling service helps browsers locate one another and exchange WebRTC connection information. The room code identifies the host browser; it is not a separate stored chatroom on a database server.

After negotiation, messages use a WebRTC data channel. The protocol is **SCTP over DTLS**, normally over UDP with ICE/STUN helping find a route. This is not a raw TCP-socket implementation. It differs from the earlier local Python version. A network that blocks WebRTC or requires an unavailable TURN relay can prevent connection, even when the site itself loads.

The app uses PeerJS's default connectivity configuration, including public ICE infrastructure. Connectivity depends on those services and network policy. It does not provision or guarantee a dedicated TURN service. Two tabs on one computer are useful for initial testing; demonstrate with two physical computers for the assignment.

### Handshake and packets

Peers exchange a protocol version, display name, cipher name, and SHA-256 digest of the normalized cipher settings. The shared key is never included in this handshake or an invite link. The digest checks compatible settings; it does **not** authenticate a person or protect a weak keyword from guessing.

```json
{"type":"hello","version":2,"name":"Alice","mode":"vigenere","proof":"64-character digest"}
```

Chat packets contain substituted message text only:

```json
{"type":"message","id":"unique-message-id","ciphertext":"Zincs, Pgvnu!","timestamp":1793550000000}
```

Other packet types: acknowledgment (`ack`), typing state (`typing`), latency check (`ping` / `pong`), rejection (`reject`), and disconnect (`bye`). Duplicate message IDs are suppressed. Chat text is limited to 2,000 UTF-16 code units per message. The inspector exposes application JSON before WebRTC's separate DTLS encryption; a Wireshark capture will not show this JSON directly in cleartext on the network.

## Features

- Responsive dark interface with room creation and invite links.
- Browser-side Vigenère, Caesar, and keyed monoalphabetic substitution.
- Key compatibility check before enabling the chat.
- Bidirectional messages, receive acknowledgments, and typing indicators.
- Measured round-trip latency and sent/received counters.
- Live cipher trace and exact chat packet inspector.
- Room capacity, validation, timeouts, and disconnect handling.
- No app database, analytics, key persistence, or chat storage.

## Privacy and limitations

These classical ciphers are educational and easy to break. Vigenère offers a useful polyalphabetic comparison to fixed substitution; it is not modern secure encryption. Room codes and matching key digests are not identity authentication. Display names, connection metadata, timestamps, message lengths, and patterns are not hidden from the participating browser. Signaling services learn connection metadata and may observe IP addresses as part of WebRTC negotiation.

WebRTC adds browser-managed encrypted transport, independently of the classroom cipher. The app keeps displayed history and keys in page memory only. Refreshing or closing the tab ends that browser's session and clears its visible conversation. The interface retains up to 200 chat/system entries. An acknowledgment means the other app received the packet, not that a human read it. Hosting and signaling providers may retain their own service/access logs.

Keep both tabs open during the demo. Mobile backgrounding, sleep, network changes, or a service outage can interrupt the connection. Invite codes expire when the hosting tab closes. Sharing a room code and keyword grants access to that room while it is available.

## Local development

The deployed app is static and needs no package installation. PeerJS 1.5.5 is vendored under `dist/vendor/` with its MIT license.

```sh
# From this repository's root:
python3 -m http.server 5174 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:5174 in two separate tabs or browser windows. Use localhost or HTTPS because Web Crypto and WebRTC depend on a secure browser context. Directly opening `index.html` through `file://` is not supported.

Run the tests using Node.js 22+:

```sh
npm test
```

## GitHub deployment

The `.github/workflows/pages.yml` workflow tests the project and publishes `dist/` to GitHub Pages after each push to `main`. No API key, paid server, or repository secret is required for the website. Repository Settings → Pages must use **GitHub Actions** as the build source.

A separate Sites subdomain was reserved, but its publishing credential handoff was blocked by the workspace approval policy. That optional copy is not published. GitHub Pages is the working deployment; pushes to main update it automatically.

## Files

```text
dist/index.html       Website structure
dist/style.css        Responsive styling
dist/app.js           UI, message display and cipher inspector
dist/cipher.js        Three ciphers, room helpers and packet validation
dist/transport.js     Peer lifecycle, handshake, messages and acknowledgments
dist/vendor/          Pinned PeerJS runtime and license
tests/                Node test suite
PROJECT_REPORT.md     Assignment report and viva notes
.github/workflows/    Automatic GitHub Pages deployment
.openai/hosting.json  Reserved, unpublished Sites configuration
```

## Troubleshooting

| Problem | Check |
| --- | --- |
| Room not online | Verify the code and keep the hosting tab open. Reloading the host requires creating a new room. |
| Cipher mismatch | Select the same cipher and key on both systems. Keywords are case-insensitive. |
| Signaling unavailable | Internet access, DNS, network filtering, or the free PeerJS service may be unavailable. Try again later. |
| Peer connection timeout | Prefer the same private Wi-Fi. Guest/campus networks may isolate devices or block WebRTC. |
| Room already has two people | Disconnect an existing peer or create a separate room. |
| Invite copy fails | Copy the displayed code manually and enter it on the other system. |
| Different output from a cipher table | Verify alphabet, handling of punctuation, and whether key indexing skips nonletters. |

## References

- [GitHub Pages: static site hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [PeerJS getting started](https://peerjs.com/client/getting-started)
- [PeerJS Cloud signaling](https://peerjs.com/server/cloud)
- [PeerJS DataConnection API](https://peerjs.com/client/api/data-connection)
- [WebRTC data channels — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)

See `PROJECT_REPORT.md` for an explanation suitable for the assignment.
