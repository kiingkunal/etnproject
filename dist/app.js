import {MODES, createCipher, formatRoom, normalizeRoom} from './cipher.js';
import {ChatSession} from './transport.js';

const $ = id => document.getElementById(id);
const session = new ChatSession();
let role = 'create', mode = 'vigenere', room = '', toastTimer, typingTimer, remoteTypingTimer;
let lastTyping = 0, currentTrace = null, wasConnected = false;
const deliveryLabels = new Map();

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500);
}
function selectedCipher() { return createCipher(mode, $('shared-key').value); }
function setRole(next) {
  if (session.state !== 'idle') return;
  role = next;
  $('create-tab').classList.toggle('active', role === 'create');
  $('join-tab').classList.toggle('active', role === 'join');
  $('create-tab').setAttribute('aria-pressed', String(role === 'create'));
  $('join-tab').setAttribute('aria-pressed', String(role === 'join'));
  $('room-field').hidden = role === 'create';
  $('room-input').required = role === 'join';
  $('connect-label').textContent = role === 'create' ? 'Create a room' : 'Join the room';
  if (['Alice','Bob'].includes($('display-name').value)) $('display-name').value = role === 'create' ? 'Alice' : 'Bob';
}
function setMode(next) {
  if (session.state !== 'idle') return;
  mode = next;
  document.querySelectorAll('[data-cipher]').forEach(button => {
    button.classList.toggle('active', button.dataset.cipher === mode);
    button.setAttribute('aria-pressed', String(button.dataset.cipher === mode));
  });
  $('key-label').textContent = MODES[mode].label;
  $('shared-key').placeholder = MODES[mode].placeholder;
  $('shared-key').inputMode = mode === 'caesar' ? 'numeric' : 'text';
  $('key-hint').textContent = MODES[mode].hint;
  $('session-cipher').textContent = $('compose-cipher').textContent = MODES[mode].name;
  if (mode === 'caesar' && !/^\d+$/.test($('shared-key').value)) $('shared-key').value = '';
  if (mode !== 'caesar' && /^\d+$/.test($('shared-key').value)) $('shared-key').value = '';
  clearTrace();
}
function clearTrace() {
  currentTrace = null;
  $('original-text').textContent = 'Your words begin here…';
  $('encrypted-text').textContent = 'A little less readable.';
  $('decrypted-text').textContent = 'Your message, recovered.';
  for (const id of ['original-text','encrypted-text','decrypted-text']) $(id).classList.add('placeholder');
  $('key-trace').replaceChildren();
  $('trace-source').textContent = 'WAITING FOR A MESSAGE';
  $('cipher-kind').textContent = MODES[mode].badge;
  $('encrypt-label').textContent = mode === 'vigenere' ? 'APPLY THE REPEATING KEY' : mode === 'caesar' ? 'SHIFT EACH LETTER' : 'APPLY THE KEYED ALPHABET';
  $('packet-json').textContent = 'No chat packet sent yet.';
  drawTracePlaceholders();
}
function drawTracePlaceholders() {
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div'); cell.className = 'trace-cell empty';
    for (let j = 0; j < 3; j++) { const row = document.createElement('span'); row.textContent = '·'; cell.append(row); }
    $('key-trace').append(cell);
  }
}
function inspect(event, element = null, sample = false) {
  currentTrace = {event, sample};
  const {plaintext, cipher, packet} = event;
  $('original-text').textContent = plaintext;
  $('encrypted-text').textContent = cipher.encrypt(plaintext);
  $('decrypted-text').textContent = cipher.decrypt(cipher.encrypt(plaintext));
  for (const id of ['original-text','encrypted-text','decrypted-text']) $(id).classList.remove('placeholder');
  $('trace-source').textContent = sample ? 'LAB SAMPLE · NOT SENT' : 'LIVE MESSAGE';
  $('cipher-kind').textContent = MODES[cipher.mode].badge;
  $('encrypt-label').textContent = cipher.mode === 'vigenere' ? 'APPLY THE REPEATING KEY' : cipher.mode === 'caesar' ? 'SHIFT EACH LETTER' : 'APPLY THE KEYED ALPHABET';
  $('key-trace').replaceChildren(...cipher.trace(plaintext).map(item => {
    const cell = document.createElement('div'); cell.className = 'trace-cell';
    for (const value of [item.plain, item.key, item.cipher]) {
      const row = document.createElement('span'); row.textContent = value === ' ' ? '␣' : value === '\n' ? '↵' : value; cell.append(row);
    }
    return cell;
  }));
  $('schedule-note').textContent = `First ${Math.min([...plaintext].length, 14)} characters · only A–Z letters are substituted. Case and punctuation stay unchanged.`;
  $('packet-json').textContent = sample ? 'LAB PREVIEW — this sample was not transmitted.\n\n' + JSON.stringify({type:'message', ciphertext:cipher.encrypt(plaintext)}, null, 2) : JSON.stringify(packet, null, 2);
  document.querySelectorAll('.message.selected').forEach(el => el.classList.remove('selected'));
  element?.classList.add('selected');
}
function sample() {
  try {
    if (!$('shared-key').value && session.state === 'idle') {
      $('shared-key').value = mode === 'caesar' ? '5' : 'SECRET';
      toast(`Sample key set to ${$('shared-key').value}. This preview sends nothing to a peer.`);
    }
    const cipher = session.cipher && session.state !== 'idle' ? session.cipher : selectedCipher();
    inspect({plaintext:'Hello, World!', cipher}, null, true);
    if (innerWidth < 900) document.querySelector('.inspector').scrollIntoView({behavior:'smooth', block:'start'});
  } catch (error) { toast(error.message); $('shared-key').focus(); }
}
function addNote(text, error = false) {
  const note = document.createElement('div'); note.className = `system-note${error ? ' error' : ''}`; note.textContent = text;
  $('messages').append(note); trimHistory(); scrollMessages();
}
function trimHistory() {
  while ($('messages').children.length > 200) {
    const oldest = $('messages').firstElementChild;
    if (oldest.dataset.messageId) deliveryLabels.delete(oldest.dataset.messageId);
    oldest.remove();
  }
}
function scrollMessages() { $('messages').scrollTop = $('messages').scrollHeight; }
function addMessage(event) {
  $('empty-chat')?.remove();
  const element = document.createElement('article'); element.className = `message ${event.direction}`;
  element.dataset.messageId = event.packet.id;
  const meta = document.createElement('div'); meta.className = 'message-meta';
  const author = document.createElement('span'); author.textContent = event.direction === 'sent' ? `${event.name} · YOU` : event.name;
  const time = document.createElement('time'); time.textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  meta.append(author, time);
  const bubble = document.createElement('button'); bubble.type = 'button'; bubble.className = 'bubble'; bubble.textContent = event.plaintext;
  bubble.title = 'Inspect the cipher for this message'; bubble.onclick = () => inspect(event, element);
  const receipt = document.createElement('div'); receipt.className = 'message-receipt';
  receipt.textContent = event.direction === 'sent' ? '↗ SENT' : '✓ RECEIVED & DECRYPTED';
  if (event.direction === 'sent') deliveryLabels.set(event.packet.id, receipt);
  element.append(meta, bubble, receipt); $('messages').append(element);
  trimHistory(); inspect(event, element); scrollMessages();
  $('sent-count').textContent = String(session.sent).padStart(2,'0');
  $('received-count').textContent = String(session.received).padStart(2,'0');
  if (event.direction === 'received') { $('typing').textContent = ''; clearTimeout(remoteTypingTimer); }
}
function updateState(state) {
  const active = state !== 'idle';
  const connected = state === 'connected';
  for (const id of ['create-tab','join-tab','display-name','shared-key','room-input','connect-button']) $(id).disabled = active;
  document.querySelectorAll('[data-cipher]').forEach(button => button.disabled = active);
  $('disconnect-button').hidden = !active;
  $('room-share').hidden = !['waiting','connecting','connected'].includes(state) || !room;
  $('message-input').disabled = $('send-button').disabled = !connected;
  $('message-input').placeholder = connected ? `Message ${session.partner}…` : 'Connect to start the conversation…';
  const labels = {idle:'Offline',starting:'Starting',waiting:'Waiting',connecting:'Connecting',connected:'Connected'};
  const status = $('connection-status'); status.className = `status ${state}`; status.replaceChildren();
  const dot = document.createElement('i'); status.append(dot, document.createTextNode(labels[state]));
  $('session-dot').classList.toggle('online', connected);
  if (connected) {
    wasConnected = true;
    $('chat-title').textContent = session.partner;
    $('chat-subtitle').textContent = `Room ${formatRoom(room)} · ${MODES[session.cipher.mode].name}`;
    $('chat-avatar').textContent = [...session.partner][0].toUpperCase();
    $('network-summary').textContent = 'Peer channel open. Messages stay in this session.';
  } else {
    $('chat-title').textContent = 'The conversation'; $('chat-avatar').textContent = '↔';
    $('chat-subtitle').textContent = state === 'waiting' ? 'Your room is open. Invite your partner.' : state === 'connecting' ? 'Establishing the peer channel…' : 'A new connection starts here.';
    $('network-summary').textContent = state === 'waiting' ? 'Waiting for your partner. Keep this tab open.' : state === 'starting' || state === 'connecting' ? 'Finding a route between your browsers…' : wasConnected ? 'Session disconnected. Create or join a room to continue.' : 'Ready when you are.';
    $('latency').textContent = '— ms'; $('typing').textContent = '';
  }
}

session.addEventListener('state', event => updateState(event.detail));
session.addEventListener('room', event => { room = event.detail; $('room-code').textContent = formatRoom(room); $('room-share').hidden = false; });
session.addEventListener('connected', () => $('message-input').focus());
session.addEventListener('note', event => addNote(event.detail));
session.addEventListener('error', event => { toast(event.detail); addNote(event.detail, true); });
session.addEventListener('notice', event => toast(event.detail));
session.addEventListener('message', event => addMessage(event.detail));
session.addEventListener('ack', event => { const label = deliveryLabels.get(event.detail); if (label) label.textContent = '✓✓ RECEIVED BY PEER'; });
session.addEventListener('latency', event => $('latency').textContent = `${event.detail} ms`);
session.addEventListener('typing', event => {
  clearTimeout(remoteTypingTimer); $('typing').textContent = event.detail ? `${session.partner} is typing…` : '';
  if (event.detail) remoteTypingTimer = setTimeout(() => $('typing').textContent = '', 3000);
});
$('create-tab').onclick = () => setRole('create');
$('join-tab').onclick = () => setRole('join');
document.querySelectorAll('[data-cipher]').forEach(button => button.onclick = () => setMode(button.dataset.cipher));
$('toggle-key').onclick = () => {
  const showing = $('shared-key').type === 'password'; $('shared-key').type = showing ? 'text' : 'password';
  $('toggle-key').textContent = showing ? 'HIDE' : 'SHOW'; $('toggle-key').setAttribute('aria-label', showing ? 'Hide shared key' : 'Show shared key');
};
$('connection-form').onsubmit = async event => {
  event.preventDefault();
  try {
    selectedCipher();
    if (role === 'join') normalizeRoom($('room-input').value);
    if (!$('display-name').value.trim()) throw new Error('Enter your display name.');
    room = ''; deliveryLabels.clear(); $('messages').querySelectorAll('.message,.system-note').forEach(el => el.remove());
    $('sent-count').textContent = $('received-count').textContent = '00'; clearTrace();
    await session.start({role, name:$('display-name').value, mode, key:$('shared-key').value, room:$('room-input').value});
  } catch (error) { toast(error.message); }
};
$('disconnect-button').onclick = () => { session.stop(); addNote('You left the room.'); };
async function copy(text, message) {
  try { await navigator.clipboard.writeText(text); toast(message); }
  catch (_) { toast(`Copy manually: ${text}`); }
}
$('copy-code').onclick = () => copy(formatRoom(room), 'Room code copied. Share the keyword separately.');
$('copy-link').onclick = () => {
  const invite = new URL(location.href); invite.search = ''; invite.hash = ''; invite.searchParams.set('room', room);
  copy(invite.href, 'Invite link copied. The shared key is not included.');
};
$('message-input').addEventListener('input', () => {
  $('character-count').textContent = `${$('message-input').value.length} / 2000`;
  $('message-input').style.height = 'auto'; $('message-input').style.height = `${Math.min($('message-input').scrollHeight, 110)}px`;
  if (Date.now() - lastTyping > 800) { session.typing(Boolean($('message-input').value)); lastTyping = Date.now(); }
  clearTimeout(typingTimer); typingTimer = setTimeout(() => session.typing(false), 1800);
});
$('message-form').onsubmit = event => {
  event.preventDefault();
  try {
    session.send($('message-input').value);
    $('message-input').value = ''; $('message-input').style.height = 'auto'; $('character-count').textContent = '0 / 2000'; $('message-input').focus();
  } catch (error) { toast(error.message); }
};
$('message-input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('message-form').requestSubmit(); }
});
$('try-demo').onclick = $('demo-button').onclick = sample;
$('shared-key').addEventListener('input', () => { if (currentTrace?.sample) { try { inspect({plaintext:'Hello, World!',cipher:selectedCipher()}, null, true); } catch (_) { clearTrace(); } } });
$('about-button').onclick = () => $('about-dialog').showModal();
$('close-about').onclick = () => $('about-dialog').close();
$('about-dialog').addEventListener('click', event => { if (event.target === $('about-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
window.addEventListener('pagehide', () => session.stop());
clearTrace();
const incomingRoom = new URL(location.href).searchParams.get('room');
if (incomingRoom) {
  try { $('room-input').value = formatRoom(normalizeRoom(incomingRoom)); setRole('join'); toast('Room code filled in. Ask your partner for the cipher and shared key.'); }
  catch (_) { toast('That invite has an invalid room code. Ask your partner for a fresh link.'); }
}
