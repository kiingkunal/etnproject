import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ChatSession} from '../dist/transport.js';

// An asynchronous in-memory adapter tests our protocol lifecycle without relying
// on the external signaling service. Real WebRTC is checked separately in browsers.
class TestChannel extends EventEmitter {
  constructor() { super(); this.open = false; this.sentPackets = []; }
  send(packet) {
    if (!this.open) throw new Error('Closed test channel');
    const copy = structuredClone(packet);
    this.sentPackets.push(copy);
    queueMicrotask(() => { if (this.other.open) this.other.emit('data',copy); });
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.open = false;
    queueMicrotask(() => this.emit('close'));
    if (this.other && !this.other.closed) this.other.close();
  }
}
class TestPeer extends EventEmitter {
  static peers = new Map();
  static sequence = 0;
  constructor(id) {
    super(); this.id = typeof id === 'string' ? id : `guest-${++TestPeer.sequence}`;
    this.destroyed = false; this.disconnected = false; this.channels = [];
    TestPeer.peers.set(this.id, this);
    setImmediate(() => { if (!this.destroyed) this.emit('open',this.id); });
  }
  connect(id) {
    const local = new TestChannel(), remote = new TestChannel();
    local.other = remote; remote.other = local; this.channels.push(local);
    const target = TestPeer.peers.get(id);
    if (!target) { setImmediate(() => this.emit('error',{type:'peer-unavailable'})); return local; }
    target.channels.push(remote); target.emit('connection',remote);
    setImmediate(() => {
      local.open = remote.open = true;
      local.emit('open'); remote.emit('open');
    });
    return local;
  }
  destroy() {
    this.destroyed = true; TestPeer.peers.delete(this.id);
    for (const channel of this.channels) channel.close();
  }
}
async function until(predicate) {
  const end = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Timed out waiting for protocol state');
    await new Promise(resolve => setTimeout(resolve,5));
  }
}
function peers(t, count = 2) {
  const list = Array.from({length:count}, () => new ChatSession(TestPeer));
  t.after(() => list.forEach(peer => peer.stop(false)));
  return list;
}
const settings = {mode:'vigenere', key:'SECRET'};
async function hostAndJoin(host, guest, overrides = {}) {
  await host.start({role:'create',name:'Alice',...settings});
  await until(() => host.state === 'waiting');
  await guest.start({role:'join',name:'Bob',room:host.room,...settings,...overrides});
}

test('handshake, bidirectional ciphertext and acknowledgments', async t => {
  const [host, guest] = peers(t);
  await hostAndJoin(host,guest);
  await until(() => host.ready && guest.ready);
  const received = [], acks = [];
  guest.addEventListener('message', event => received.push(event.detail));
  host.addEventListener('ack', event => acks.push(event.detail));
  const packet = host.send('Hello, World!');
  await until(() => received.length && acks.length);
  assert.equal(received[0].plaintext,'Hello, World!');
  assert.equal(received[0].packet.ciphertext,'Zincs, Pgvnu!');
  assert.equal(acks[0],packet.id);
  assert.ok(!JSON.stringify(host.connection.sentPackets).includes('Hello, World!'));
  assert.ok(!JSON.stringify(host.connection.sentPackets).includes('SECRET'));
  guest.send('Reply नमस्ते 👋');
  await until(() => host.received === 1);
  assert.equal(host.sent,1); assert.equal(guest.sent,1);
});
test('mismatched key is rejected and the same host accepts a corrected retry', async t => {
  const [host, guest] = peers(t);
  await hostAndJoin(host,guest,{key:'WRONG'});
  await until(() => guest.state === 'idle' && host.state === 'waiting');
  assert.equal(host.ready,false);
  await guest.start({role:'join',name:'Bob',room:host.room,...settings});
  await until(() => guest.ready && host.ready);
  assert.equal(host.partner,'Bob');
});
test('two-person room rejects a third peer without breaking the existing channel', async t => {
  const [host, guest, extra] = peers(t,3);
  await hostAndJoin(host,guest);
  await until(() => guest.ready && host.ready);
  await extra.start({role:'join',name:'Third',room:host.room,...settings});
  await until(() => extra.state === 'idle');
  assert.equal(host.state,'connected'); assert.equal(guest.state,'connected');
  host.send('Still connected');
  await until(() => guest.received === 1);
});
test('disconnect preserves the host room, rejoin works and duplicate IDs are suppressed', async t => {
  const [host, guest] = peers(t);
  await hostAndJoin(host,guest);
  await until(() => guest.ready && host.ready);
  const packet = host.send('Only once');
  await until(() => guest.received === 1);
  host.connection.send(packet);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(guest.received,1);
  guest.stop();
  await until(() => host.state === 'waiting');
  await guest.start({role:'join',name:'Bob',room:host.room,...settings});
  await until(() => guest.ready && host.ready);
});
test('invalid packets close a session and send is forbidden before the handshake', async t => {
  const [host, guest] = peers(t);
  assert.throws(() => host.send('offline'));
  await hostAndJoin(host,guest);
  await until(() => guest.ready && host.ready);
  guest.connection.send({type:'message',ciphertext:'invalid'});
  await until(() => host.state === 'waiting' && guest.state === 'idle');
});
