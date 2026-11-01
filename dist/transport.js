import {createCipher, fingerprint, generateRoom, normalizeRoom, validatePacket, makeMessage} from './cipher.js';

export class ChatSession extends EventTarget {
  constructor(PeerClass = globalThis.Peer) {
    super();
    this.PeerClass = PeerClass;
    this.state = 'idle';
    this.generation = 0;
    this.peer = null;
    this.connection = null;
    this.ready = false;
    this.seen = new Set();
    this.pending = new Map();
    this.sent = 0;
    this.received = 0;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, {detail})); }
  setState(state) { this.state = state; this.emit('state', state); }
  clearTimers() { clearTimeout(this.deadline); clearInterval(this.heartbeat); this.pending.clear(); }
  stop(notify = true) {
    this.generation++;
    this.clearTimers();
    this.ready = false;
    const connection = this.connection;
    this.connection = null;
    if (connection?.open) {
      try { if (notify) connection.send({type:'bye'}); } catch (_) { /* already closed */ }
    }
    connection?.close();
    this.peer?.destroy(); this.peer = null;
    this.setState('idle');
  }
  fail(message) { this.stop(false); this.emit('error', message); }

  async start({role, name, mode, key, room}) {
    if (this.state !== 'idle') throw new Error('Disconnect before opening another room.');
    if (!this.PeerClass) throw new Error('The connection library did not load. Refresh the website.');
    if (!name.trim() || name.trim().length > 30) throw new Error('Enter a name of 1–30 characters.');
    const cipher = createCipher(mode, key);
    const code = role === 'create' ? generateRoom() : normalizeRoom(room);
    this.name = name.trim(); this.role = role; this.room = code; this.cipher = cipher;
    this.sent = this.received = 0; this.seen.clear();
    const generation = ++this.generation;
    this.setState('starting');
    try {
      this.proof = await fingerprint(cipher);
      if (generation !== this.generation) return;
      const id = `etnproject-v2-${code}`;
      const options = {debug:0};
      this.peer = role === 'create' ? new this.PeerClass(id, options) : new this.PeerClass(options);
      const current = () => generation === this.generation;
      this.deadline = setTimeout(() => { if (current()) this.fail('The signaling service did not respond. Check your internet connection and try again.'); }, 25000);
      this.peer.on('open', () => {
        if (!current()) return;
        clearTimeout(this.deadline);
        this.emit('room', code);
        if (role === 'create') {
          this.setState('waiting');
          this.emit('note', 'Room created. Share the invite link and agree on your keyword separately.');
        } else {
          this.setState('connecting');
          this.attach(this.peer.connect(id, {reliable:true, serialization:'json', label:'etnproject-v2'}), generation);
        }
      });
      this.peer.on('connection', connection => {
        if (!current()) { connection.close(); return; }
        if (role !== 'create' || this.connection) {
          connection.on('open', () => { connection.send({type:'reject', reason:'busy'}); setTimeout(() => connection.close(), 150); });
          return;
        }
        this.attach(connection, generation);
      });
      this.peer.on('error', error => {
        if (!current()) return;
        const messages = {
          'peer-unavailable':'That room is not online. Check the code and ask your partner to keep their tab open.',
          'unavailable-id':'That room code is already in use. Create a new room.',
          'browser-incompatible':'This browser does not support WebRTC. Try a current Chrome, Edge, Firefox, or Safari.',
          'network':'Could not reach the signaling service. Check your internet connection.',
          'webrtc':'The network blocked the peer connection. Try the same private Wi-Fi or a different network.'
        };
        this.fail(messages[error.type] || 'Connection failed. Check your network and try creating a new room.');
      });
      this.peer.on('disconnected', () => {
        if (!current()) return;
        if (this.ready && this.connection?.open) {
          this.emit('note', 'The signaling service disconnected. Your existing chat channel is still open.');
        } else {
          this.fail('The signaling connection closed. Create or join the room again.');
        }
      });
    } catch (error) {
      if (generation === this.generation) this.stop(false);
      throw error;
    }
  }

  attach(connection, generation) {
    this.connection = connection;
    this.ready = false;
    this.setState('connecting');
    const current = () => generation === this.generation && connection === this.connection;
    this.deadline = setTimeout(() => {
      if (current()) this.drop('Connection timed out. Keep both tabs open and try a private Wi-Fi network.');
    }, 25000);
    connection.on('open', () => {
      if (!current()) return;
      connection.send({type:'hello', version:2, name:this.name, mode:this.cipher.mode, proof:this.proof});
    });
    connection.on('data', packet => {
      if (!current()) return;
      if (!validatePacket(packet)) { this.drop('The peer sent an invalid packet.'); return; }
      if (packet.type === 'reject') {
        this.drop(packet.reason === 'busy' ? 'This room already has two participants.' : 'Cipher settings do not match. Use the same cipher and key on both systems.');
        return;
      }
      if (packet.type === 'hello') {
        if (this.ready) { this.drop('Unexpected second handshake.'); return; }
        if (packet.mode !== this.cipher.mode || packet.proof !== this.proof) {
          connection.send({type:'reject', reason:'mismatch'});
          this.drop('Cipher settings do not match. Use the same cipher and key on both systems.');
          return;
        }
        this.partner = packet.name; this.ready = true;
        clearTimeout(this.deadline);
        this.setState('connected');
        this.emit('connected', packet.name);
        this.emit('note', `${packet.name} connected. Your cipher settings match.`);
        this.heartbeat = setInterval(() => this.ping(), 5000);
        setTimeout(() => { if (current()) this.ping(); }, 300);
        return;
      }
      if (packet.type === 'bye') { this.drop('Your partner left the room.'); return; }
      if (!this.ready) { this.drop('A message arrived before the cipher handshake.'); return; }
      if (packet.type === 'message') {
        if (!this.seen.has(packet.id)) {
          this.seen.add(packet.id);
          if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value);
          this.received++;
          this.emit('message', {direction:'received', name:this.partner, plaintext:this.cipher.decrypt(packet.ciphertext), packet, cipher:this.cipher});
        }
        connection.send({type:'ack', id:packet.id});
      } else if (packet.type === 'ack') {
        this.emit('ack', packet.id);
      } else if (packet.type === 'typing') {
        this.emit('typing', packet.active);
      } else if (packet.type === 'ping') {
        connection.send({type:'pong', nonce:packet.nonce});
      } else if (packet.type === 'pong' && this.pending.has(packet.nonce)) {
        this.emit('latency', Math.round(performance.now() - this.pending.get(packet.nonce)));
        this.pending.delete(packet.nonce);
      }
    });
    connection.on('close', () => { if (current()) this.drop('The peer connection closed.'); });
    connection.on('error', () => { if (current()) this.drop('The peer connection failed. Try the same private Wi-Fi network.'); });
  }

  drop(message) {
    this.clearTimers(); this.ready = false;
    const connection = this.connection; this.connection = null;
    connection?.close();
    if (this.role === 'create' && this.peer && !this.peer.destroyed && !this.peer.disconnected) {
      this.setState('waiting');
      this.emit('note', `${message} The room is still open for a new connection.`);
    } else {
      this.stop(false);
      this.emit('note', message);
    }
    this.emit('notice', message);
  }
  ping() {
    if (!this.ready || !this.connection?.open) return;
    if (this.pending.size > 2) { this.drop('Your partner is no longer responding. Rejoin the room to continue.'); return; }
    const nonce = crypto.randomUUID(); this.pending.set(nonce, performance.now());
    try { this.connection.send({type:'ping', nonce}); }
    catch (_) { this.drop('The connection is no longer available.'); }
  }
  send(text) {
    if (!this.ready || !this.connection?.open) throw new Error('Connect to your partner first.');
    const packet = makeMessage(text, this.cipher);
    this.connection.send(packet);
    this.sent++;
    this.emit('message', {direction:'sent', name:this.name, plaintext:text, packet, cipher:this.cipher});
    this.typing(false);
    return packet;
  }
  typing(active) {
    if (this.ready && this.connection?.open) {
      try { this.connection.send({type:'typing', active}); } catch (_) { /* next heartbeat checks connection */ }
    }
  }
}
