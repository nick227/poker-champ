const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "icons");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Minimal 16x16 ICO: ICONDIR (6) + ICONDIRENTRY (16) + DIB (40 + 16*16*4)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry[0] = 16;
entry[1] = 16;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
const bmpSize = 40 + 16 * 16 * 4;
entry.writeUInt32LE(bmpSize, 8);
entry.writeUInt32LE(22, 12);

const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0);
dib.writeInt32LE(16, 4);
dib.writeInt32LE(32, 8);
dib.writeUInt16LE(1, 12);
dib.writeUInt16LE(32, 14);

const pixels = Buffer.alloc(16 * 16 * 4);
for (let i = 0; i < 16 * 16 * 4; i += 4) {
  pixels[i] = 80;
  pixels[i + 1] = 120;
  pixels[i + 2] = 200;
  pixels[i + 3] = 255;
}

const ico = Buffer.concat([header, entry, dib, pixels]);
fs.writeFileSync(path.join(outDir, "icon.ico"), ico);
console.log("Created icons/icon.ico");
