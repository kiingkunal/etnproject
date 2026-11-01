import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipher, fingerprint, generateRoom, normalizeRoom, formatRoom, validatePacket, makeMessage, ALPHABET} from '../dist/cipher.js';

test('Vigenère matches the published classical test vector', () => {
  const cipher = createCipher('vigenere', 'LEMON');
  assert.equal(cipher.encrypt('ATTACK AT DAWN'), 'LXFOPV EF RNHR');
  assert.equal(cipher.decrypt('LXFOPV EF RNHR'), 'ATTACK AT DAWN');
  assert.equal(createCipher('vigenere','SECRET').encrypt('Hello, World.'), 'Zincs, Pgvnu.');
});
test('Caesar shifts letters while retaining case and symbols', () => {
  const cipher = createCipher('caesar','5');
  assert.equal(cipher.encrypt('ROOM 204'), 'WTTR 204');
  assert.equal(cipher.encrypt('Zebra!'), 'Ejgwf!');
  assert.equal(cipher.decrypt('Ejgwf!'), 'Zebra!');
});
test('keyword substitution constructs a permutation and removes duplicate key letters', () => {
  const cipher = createCipher('mono','NETWORK');
  assert.equal(cipher.alphabet,'NETWORKABCDFGHIJLMPQSUVXYZ');
  assert.equal(cipher.encrypt('Hello Bob!'),'Aoffi Eie!');
  assert.equal(createCipher('mono','SECRET').alphabet, createCipher('mono','SECRT').alphabet);
  assert.equal(new Set(cipher.alphabet).size, 26);
});
test('all ciphers round-trip Unicode, multiline text, punctuation and every English letter', () => {
  const text = `${ALPHABET}\n${ALPHABET.toLowerCase()} 204 नमस्ते 👋 café <script>"\\`;
  for (const mode of ['vigenere','mono','caesar']) {
    const cipher = createCipher(mode, mode === 'caesar' ? '25' : 'Secret');
    assert.equal(cipher.decrypt(cipher.encrypt(text)), text);
    assert.equal(cipher.encrypt('204 नमस्ते 👋 é'),'204 नमस्ते 👋 é');
  }
});
test('invalid or identity keys are rejected', () => {
  for (const [mode,key] of [['vigenere',''],['vigenere','AAA'],['vigenere','KEY 123'],['vigenere','é'],['vigenere','A'.repeat(65)],['caesar','0'],['caesar','26'],['caesar','1.5'],['caesar','-1'],['mono','A'],['unsupported','KEY']]) {
    assert.throws(() => createCipher(mode,key));
  }
});
test('the key advances only on ASCII letters, including the character trace', () => {
  const cipher = createCipher('vigenere','BC');
  assert.equal(cipher.encrypt('A A! A'), 'B C! B');
  assert.deepEqual(cipher.trace('A A! A').map(x => x.key), ['B','·','C','·','·','B']);
  assert.equal(cipher.trace('1234567890123456789').length, 14);
});
test('fingerprint normalizes equivalent keys but distinguishes cipher modes', async () => {
  assert.equal(await fingerprint(createCipher('vigenere','secret')), await fingerprint(createCipher('vigenere','SECRET')));
  assert.equal(await fingerprint(createCipher('mono','SECRET')), await fingerprint(createCipher('mono','SECRT')));
  assert.notEqual(await fingerprint(createCipher('vigenere','SECRET')), await fingerprint(createCipher('mono','SECRET')));
});
test('generated room codes can be formatted and parsed without ambiguity', () => {
  assert.equal(normalizeRoom('ETNAB-CDEFG'),'ETNABCDEFG');
  const codes = new Set();
  for (let i = 0; i < 100; i++) {
    const code = generateRoom(); codes.add(code);
    assert.equal(normalizeRoom(formatRoom(code).toLowerCase()),code);
  }
  assert.equal(codes.size,100);
  for (const code of ['','abc','00000-00000','ABCDEFGHIJ','<script>']) assert.throws(() => normalizeRoom(code));
});
test('chat packets contain ciphertext and metadata, never plaintext or key', () => {
  const cipher = createCipher('vigenere','SECRET');
  const packet = makeMessage('Hello, World!',cipher);
  assert.equal(validatePacket(packet),true);
  assert.deepEqual(Object.keys(packet),['type','id','ciphertext','timestamp']);
  assert.ok(!JSON.stringify(packet).includes('Hello'));
  assert.ok(!JSON.stringify(packet).includes('SECRET'));
});
test('message boundaries and malformed packets are validated', () => {
  const cipher = createCipher('caesar','3');
  for (const text of ['', '   ', 'a'.repeat(2001), null]) assert.throws(() => makeMessage(text,cipher));
  assert.equal(validatePacket(makeMessage('a'.repeat(2000),cipher)),true);
  for (const packet of [null, [], {}, {type:'message',id:'x',ciphertext:'',timestamp:1}, {type:'message',id:'<bad>',ciphertext:'abc',timestamp:1}, {type:'message',id:'x',ciphertext:'a'.repeat(2001),timestamp:1}, {type:'hello',version:2,name:'x',mode:'unknown',proof:'a'.repeat(64)}]) assert.equal(validatePacket(packet),false);
});
