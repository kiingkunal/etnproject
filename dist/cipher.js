export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const MAX_MESSAGE = 2000;
export const MODES = {
  vigenere: {name:'Vigenère', badge:'POLYALPHABETIC', label:'Shared keyword', placeholder:'e.g. SECRET', hint:'A–Z letters only. The keyword repeats across message letters.'},
  caesar: {name:'Caesar', badge:'FIXED SHIFT', label:'Shared shift', placeholder:'1–25', hint:'A whole number from 1 to 25. Both systems use the same shift.'},
  mono: {name:'Monoalphabetic', badge:'KEYED ALPHABET', label:'Shared keyword', placeholder:'e.g. SECRET', hint:'A–Z letters only. Duplicate letters are removed to build the alphabet.'}
};

export function createCipher(mode, rawKey) {
  if (!Object.hasOwn(MODES, mode)) throw new Error('Choose a supported cipher.');
  const key = String(rawKey).trim().toUpperCase();
  let alphabet = ALPHABET;
  if (mode === 'caesar') {
    if (!/^(?:[1-9]|1[0-9]|2[0-5])$/.test(key)) throw new Error('Caesar needs a whole-number shift from 1 to 25.');
    alphabet = ALPHABET.slice(Number(key)) + ALPHABET.slice(0, Number(key));
  } else {
    if (!/^[A-Z]{1,64}$/.test(key)) throw new Error('Use a keyword of 1–64 English letters (A–Z).');
    if (mode === 'mono') {
      alphabet = [...new Set(key + ALPHABET)].join('');
      if (alphabet === ALPHABET) throw new Error('This keyword leaves the alphabet unchanged. Try SECRET or NETWORK.');
    } else if ([...key].every(c => c === 'A')) {
      throw new Error('An all-A Vigenère key makes no change. Try SECRET.');
    }
  }
  function transform(text, reverse = false) {
    let letterIndex = 0;
    return [...text].map(character => {
      if (!/^[a-z]$/i.test(character)) return character;
      const upper = character.toUpperCase();
      const position = ALPHABET.indexOf(upper);
      let output;
      if (mode === 'vigenere') {
        const shift = ALPHABET.indexOf(key[letterIndex++ % key.length]);
        output = ALPHABET[(position + (reverse ? -shift : shift) + 26) % 26];
      } else {
        output = reverse ? ALPHABET[alphabet.indexOf(upper)] : alphabet[position];
      }
      return character === upper ? output : output.toLowerCase();
    }).join('');
  }
  return {
    mode, key, alphabet,
    identity: mode === 'mono' ? alphabet : key,
    encrypt: text => transform(text),
    decrypt: text => transform(text, true),
    trace(text) {
      const encrypted = transform(text);
      const output = [...encrypted];
      let index = 0;
      return [...text].slice(0, 14).map((plain, i) => {
        const letter = /^[a-z]$/i.test(plain);
        const keyLetter = mode === 'vigenere' && letter ? key[index++ % key.length] : '';
        return {plain, cipher:output[i], key:letter ? (mode === 'caesar' ? `+${key}` : mode === 'vigenere' ? keyLetter : '↦') : '·'};
      });
    }
  };
}

export async function fingerprint(cipher) {
  const bytes = new TextEncoder().encode(`etnproject:2:${cipher.mode}:${cipher.identity}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateRoom() {
  return [...crypto.getRandomValues(new Uint8Array(10))].map(byte => ROOM_LETTERS[byte % 32]).join('');
}
export function normalizeRoom(value) {
  const room = String(value).trim().toUpperCase().replace(/^ETN[-\s]/, '').replace(/[-\s]/g, '');
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(room)) throw new Error('Enter the full 10-character room code from your partner.');
  return room;
}
export function formatRoom(room) { return `${room.slice(0, 5)}-${room.slice(5)}`; }

export function validatePacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return false;
  if (packet.type === 'hello') return packet.version === 2 && typeof packet.name === 'string' && packet.name.length >= 1 && packet.name.length <= 30 && Object.hasOwn(MODES, packet.mode) && /^[a-f0-9]{64}$/.test(packet.proof);
  if (packet.type === 'message') return typeof packet.id === 'string' && /^[a-z0-9-]{1,64}$/i.test(packet.id) && typeof packet.ciphertext === 'string' && packet.ciphertext.length >= 1 && packet.ciphertext.length <= MAX_MESSAGE && Number.isFinite(packet.timestamp);
  if (packet.type === 'ack') return typeof packet.id === 'string' && packet.id.length <= 64;
  if (packet.type === 'typing') return typeof packet.active === 'boolean';
  if (packet.type === 'ping' || packet.type === 'pong') return typeof packet.nonce === 'string' && packet.nonce.length <= 64;
  if (packet.type === 'reject') return ['busy','mismatch','invalid'].includes(packet.reason);
  if (packet.type === 'bye') return true;
  return false;
}

export function makeMessage(text, cipher) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_MESSAGE) throw new Error('Enter a message of 1–2,000 characters.');
  return {type:'message', id:crypto.randomUUID(), ciphertext:cipher.encrypt(text), timestamp:Date.now()};
}
