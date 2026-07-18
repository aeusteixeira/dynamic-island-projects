// Gera assets/icon.ico (PNG 256x256 embutido em container ICO) sem libs externas.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const S = 256;
const c = (S - 1) / 2;
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    const o = y * (S * 4 + 1) + 1 + x * 4;
    const dx = x - c;
    const dy = y - c;
    const d = Math.sqrt(dx * dx + dy * dy);
    let r = 0, g = 0, b = 0, a = 0;
    if (d <= 118) { r = 20; g = 20; b = 26; a = 255; }
    if (d <= 102) { r = 124; g = 92; b = 255; a = 255; }
    if (Math.abs(dy) <= 20 && Math.abs(dx) <= 58) { r = 245; g = 245; b = 250; a = 255; }
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

// container ICO: ICONDIR + 1 ICONDIRENTRY + PNG
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); // reservado
dir.writeUInt16LE(1, 2); // tipo: ícone
dir.writeUInt16LE(1, 4); // quantidade
const entry = Buffer.alloc(16);
entry[0] = 0; // largura 256
entry[1] = 0; // altura 256
entry[2] = 0; // cores
entry[3] = 0; // reservado
entry.writeUInt16LE(1, 4);  // planos
entry.writeUInt16LE(32, 6); // bits
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12); // offset

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([dir, entry, png]));
console.log('icon.ico gerado (256x256)');
