// Gera os ícones da bandeja (32x32 PNG) sem depender de nenhuma lib de imagem.
// icon.png (roxo), icon-working.png (laranja), icon-done.png (verde), icon-wait.png (âmbar)
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

function makeIcon(rgb) {
  const S = 32;
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0; // filtro da scanline
    for (let x = 0; x < S; x++) {
      const o = y * (S * 4 + 1) + 1 + x * 4;
      const dx = x - 15.5;
      const dy = y - 15.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      let r = 0, g = 0, b = 0, a = 0;
      if (d <= 14.5) { r = 20; g = 20; b = 26; a = 255; }                 // disco escuro
      if (d <= 12.5) { [r, g, b] = rgb; a = 255; }                        // cor do estado
      if (Math.abs(dy) <= 2.5 && Math.abs(dx) <= 7) { r = 245; g = 245; b = 250; a = 255; } // "pílula"
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
const variants = {
  'icon.png': [124, 92, 255],          // roxo (padrão)
  'icon-working.png': [217, 119, 87],  // laranja (trabalhando)
  'icon-done.png': [61, 220, 151],     // verde (pronto)
  'icon-wait.png': [255, 180, 84],     // âmbar (esperando você)
};
for (const [name, rgb] of Object.entries(variants)) {
  fs.writeFileSync(path.join(out, name), makeIcon(rgb));
}
console.log('ícones gerados em', out, Object.keys(variants).join(', '));
