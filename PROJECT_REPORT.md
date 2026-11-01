# ETNProject: Two-System Chat with Shared-Key Substitution Ciphers

**Subject:** Exploring the Networks  
**Student:** ____________________  
**Roll number:** ____________________  
**Class / division:** ____________________

## Aim

To create a hosted chat website in which two computer systems exchange messages using a substitution technique, with encryption at the sender and decryption at the receiver.

## Implementation

The website is written in HTML, CSS, and JavaScript, deployed from a GitHub repository to GitHub Pages. A second static deployment provides an ETNProject subdomain. Users open the website on two computers, choose the same cipher and shared key, and join a room. The browser applies the cipher before sending a message. The other browser reverses the mapping after receipt.

PeerJS 1.5.5 manages WebRTC negotiation through its free cloud signaling service. Messages travel through a reliable WebRTC data channel, with SCTP over DTLS, normally using UDP. The static hosting server does not run the chat backend or store messages. This hosted implementation is distinct from a Python TCP server/client application.

## Objectives

1. Connect two systems through a browser-based network application.
2. Demonstrate classical shared-key substitution at the application layer.
3. Compare Caesar, Vigenère, and keyed monoalphabetic techniques.
4. Show the original message, ciphertext, recovered text, and packet structure.
5. Handle mismatched settings, unavailable peers, disconnects, and acknowledgments.

## Requirements

Two computers, modern WebRTC-capable browsers, and internet access. A shared private Wi-Fi network is preferred for the demonstration. No Python or Node installation is required to use the hosted site. Local development optionally uses Python for static serving and Node.js 22+ for automated tests.

## Architecture

```text
Static hosting ── HTTPS ──→ Browser A and Browser B
PeerJS Cloud  ←── WSS signaling and connection details ──→ Both browsers

Browser A                                      Browser B
Original text                                  Recovered text
     ↓ shared-key substitution                       ↑ inverse substitution
Ciphertext ═══════ WebRTC data channel ═══════→ Ciphertext
           ←═════ replies use the same channel ═══════
```

## Cipher algorithms

All algorithms operate on the 26 English letters A–Z, preserving case. Digits, spaces, punctuation, and non-English characters pass through unchanged. Keys are normalized to uppercase.

### Vigenère — default

Each keyword letter defines a shift using A = 0, B = 1, …, Z = 25. Repeat the keyword across English letters in the plaintext, skipping nonletters. Restart the keyword at the start of each message.

For plaintext position `P`, keyword value `K`, and ciphertext position `C`:

```text
Encryption: C = (P + K) mod 26
Decryption: P = (C - K + 26) mod 26

Plaintext:  ATTACK AT DAWN
Key:        LEMONL EM ONLE
Ciphertext: LXFOPV EF RNHR
```

The repeating shifts make this polyalphabetic substitution. Unlike a monoalphabetic cipher, the same plaintext letter can map to different ciphertext letters at different key positions.

### Caesar

The key is a whole number from 1 to 25. Every English letter uses the same shift.

```text
Key:        5
Plaintext:  ROOM 204
Ciphertext: WTTR 204
```

### Monoalphabetic keyword substitution

Remove repeated keyword letters, then append the unused alphabet letters. Use the resulting permutation as a fixed substitution table.

```text
Key:    NETWORK
Plain:  ABCDEFGHIJKLMNOPQRSTUVWXYZ
Cipher: NETWORKABCDFGHIJLMPQSUVXYZ

Hello Bob! → Aoffi Eie! → Hello Bob!
```

Each letter always has the same replacement within this mode. Identity keys that leave all letters unchanged are rejected.

## Program flow

1. System A creates a randomly generated 10-character room code and registers a host peer ID with the signaling service.
2. System B uses the invite link or enters the room code to find the host.
3. WebRTC exchanges connection descriptions and ICE candidates to establish a data channel.
4. Each system sends its name, protocol version, cipher name, and digest of normalized cipher settings. The actual key is not transmitted by the application.
5. Matching settings enable chat. A mismatch is rejected; the host remains available for another attempt.
6. Outgoing text is substituted, placed in a JSON packet, and sent through the data channel.
7. The receiver validates the packet, decrypts its text, displays it, and sends an acknowledgment containing the message ID.
8. Periodic ping/pong messages measure round-trip time and help detect an unresponsive peer.

## Application packet

For Vigenère key SECRET:

```json
{"type":"message","id":"unique-id","ciphertext":"Zincs, Pgvnu!","timestamp":1793550000000}
```

The application packet has ciphertext, an ID, and a timestamp. It contains neither plaintext nor the shared key. The inspector shows this object before DTLS transport encryption. Captured physical-network traffic is additionally encrypted by WebRTC, so the inspector is the appropriate place to demonstrate the classroom substitution output.

## Networking concepts demonstrated

| Concept | Use in the project |
| --- | --- |
| DNS and HTTPS | Resolve the hosted URL and load the website. |
| Signaling | Exchange peer identities and connection details through PeerJS. |
| IP addresses and ICE | Discover a usable route between the computers. |
| WebRTC data channel | Bidirectional browser-to-browser application messages. |
| SCTP | Reliable, ordered data channel transport. |
| DTLS | Browser-provided encryption beneath the demonstration cipher. |
| Application protocol | JSON messages, hello handshake, acknowledgments, typing and ping/pong. |
| Round-trip delay | Measure time from ping transmission to matching pong receipt. |

## Test cases

| Case | Expected outcome |
| --- | --- |
| Vigenère, LEMON, ATTACK AT DAWN | LXFOPV EF RNHR, followed by exact recovery. |
| Caesar, 5, ROOM 204 | WTTR 204, with digits unchanged. |
| Monoalphabetic, NETWORK, Hello Bob! | Aoffi Eie!, followed by exact recovery. |
| Mixed case, Unicode, multiline text | English letters substituted; other characters preserved. |
| Invalid or identity keys | Rejected before connection. |
| Same cipher and key | Both systems become Connected. |
| Wrong key or cipher | Connection rejected; host remains available. |
| Messages in both directions | Receiver displays exact original text. |
| Acknowledgment | Sender changes message status to Received by peer. |
| Third participant | Existing two-person room rejects the extra connection. |
| Close or disconnect peer | UI reports the disconnected session. |
| Actual two-computer Wi-Fi run | Both physical systems send and receive through the hosted website. |

Automated checks use `npm test`. They verify the cipher vectors, reversible transformations, validation, room-code normalization, packet contents, and protocol lifecycle. Browser checks verify the actual UI and WebRTC connection separately. A two-physical-computer test is still required on the demonstration network.

## Limitations

These are historical ciphers, not modern security systems. Caesar has only 25 keys; monoalphabetic substitution is susceptible to frequency analysis; repeating-key Vigenère also has known attacks. The compatibility digest is not identity authentication and may enable key guessing. No login or persistent message database is provided. Room codes are valid only while the host tab is open. Mobile sleep and restrictive networks can interrupt the chat. The free signaling/ICE infrastructure may become unavailable, and no dedicated TURN relay is provisioned.

## Conclusion

ETNProject meets the stated two-system chat and substitution-encryption task through a hosted browser interface. It makes the application-layer cipher observable while demonstrating peer discovery, connection negotiation, reliable bidirectional delivery, and acknowledgments. It also distinguishes classical cipher transformations from the separate transport security provided by WebRTC.

## Viva notes

**Why can this be hosted on GitHub Pages?** The website consists entirely of static HTML, CSS, and JavaScript. Browser-side WebRTC handles the data connection, while PeerJS provides external signaling.

**Does GitHub route the messages?** No. GitHub serves website assets; it is not the app's chat server.

**What does the signaling service do?** It exchanges connection details so the browsers can establish a channel. It is separate from the chat data path.

**Does same Wi-Fi mean no internet is needed?** No. This deployment uses internet hosting and a public signaling service even when the peers share a Wi-Fi network.

**Is it TCP?** The hosted chat uses a WebRTC data channel: SCTP over DTLS, normally over UDP. The earlier local Python implementation used raw TCP sockets. Do not describe this hosted version as that implementation.

**Why Vigenère by default?** It illustrates polyalphabetic substitution: shifts change with a repeating key. It provides a richer classroom comparison than a single fixed shift, but remains insecure by modern standards.

**Is the key sent?** Not by the application. Both people enter it independently and exchange a digest to detect incompatible cipher settings.

**Does a matching digest prove identity?** No. It is a compatibility check only.

**Do spaces advance the Vigenère key?** No. Only ASCII English letters advance it in this implementation.

**What does a delivery acknowledgment mean?** The receiving app accepted the packet. It does not prove that a human read the message.

**Will Wireshark show the substitution ciphertext as plaintext JSON?** Not directly. WebRTC encrypts transport with DTLS. The in-app packet inspector shows the JSON before that transport encryption.
