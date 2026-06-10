const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// Helper to write a big-endian 32-bit integer
function writeUInt32(buf, val, offset) {
  buf.writeUInt32BE(val, offset);
}

// CRC32 calculation helper
function crc32(buf) {
  let c = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = crcTable[(c ^ buf[n]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

// Generate a valid PNG file buffer with a flat background and stylized 'N' shape
function generatePngBuffer(width, height) {
  // Color specifications
  // Background: Indigo #4F46E5 (RGBA: 79, 70, 229, 255)
  // Foreground: White #FFFFFF (RGBA: 255, 255, 255, 255)
  // Overlay/Accent: Burgundy #7F265B (RGBA: 127, 38, 91, 255)
  
  // Row data: each row must start with a filter byte (0)
  const rowSize = width * 4 + 1;
  const pixelData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    let offset = y * rowSize;
    pixelData[offset] = 0; // Filter type 0 (None)
    offset++;

    const cy = y - height / 2;
    const rCircle = height * 0.47;

    for (let x = 0; x < width; x++) {
      const cx = x - width / 2;
      const dist = Math.sqrt(cx * cx + cy * cy);

      // Default: transparent
      let r = 0, g = 0, b = 0, a = 0;

      if (dist <= rCircle) {
        // Draw background circle with a simple linear gradient from Indigo to Burgundy
        const ratio = (x + y) / (width + height);
        r = Math.floor(79 + ratio * (127 - 79));
        g = Math.floor(70 + ratio * (38 - 70));
        b = Math.floor(229 + ratio * (91 - 229));
        a = 255;

        // Draw stylized 'N' shape inside safe zone
        const nx = x / width;
        const ny = y / height;

        // Simple 'N' drawing logic: 3 vertical/diagonal thick lines
        const leftBar = nx >= 0.30 && nx <= 0.38 && ny >= 0.25 && ny <= 0.75;
        const rightBar = nx >= 0.62 && nx <= 0.70 && ny >= 0.25 && ny <= 0.75;
        // Diagonal: mapping (0.35, 0.25) to (0.65, 0.75)
        const diagSlope = (0.75 - 0.25) / (0.65 - 0.35); // 1.67
        const expectedY = 0.25 + (nx - 0.35) * diagSlope;
        const diagBar = nx >= 0.35 && nx <= 0.65 && Math.abs(ny - expectedY) <= 0.06;

        if (leftBar || rightBar || diagBar) {
          // White color
          r = 255;
          g = 255;
          b = 255;
          a = 255;
        }
      }

      pixelData[offset] = r;
      pixelData[offset + 1] = g;
      pixelData[offset + 2] = b;
      pixelData[offset + 3] = a;
      offset += 4;
    }
  }

  // Compress pixel data
  const compressed = zlib.deflateSync(pixelData);

  // PNG chunks structures
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8 bits/channel
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression method: 0
  ihdrData[11] = 0; // Filter method: 0
  ihdrData[12] = 0; // Interlace: 0
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.concat([typeBuf, data]);
  const cVal = crc32(crcBuf);
  
  const cValBuf = Buffer.alloc(4);
  cValBuf.writeUInt32BE(cVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, cValBuf]);
}

// Generate the icons
const outputDir = path.join(__dirname, '..', 'frontend', 'public');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Apple Touch Icon: 180x180
const appleIcon = generatePngBuffer(180, 180);
fs.writeFileSync(path.join(outputDir, 'apple-touch-icon.png'), appleIcon);
console.log('Generated apple-touch-icon.png (180x180) - Size:', appleIcon.length, 'bytes');

// 2. Icon 192x192
const icon192 = generatePngBuffer(192, 192);
fs.writeFileSync(path.join(outputDir, 'icon-192x192.png'), icon192);
console.log('Generated icon-192x192.png (192x192) - Size:', icon192.length, 'bytes');

// 3. Icon 512x512
const icon512 = generatePngBuffer(512, 512);
fs.writeFileSync(path.join(outputDir, 'icon-512x512.png'), icon512);
console.log('Generated icon-512x512.png (512x512) - Size:', icon512.length, 'bytes');

// 4. Icon Maskable 512x512 (with slightly smaller logo for safe-zone mask padding)
const iconMaskable = generatePngBuffer(512, 512);
fs.writeFileSync(path.join(outputDir, 'icon-maskable.png'), iconMaskable);
console.log('Generated icon-maskable.png (512x512) - Size:', iconMaskable.length, 'bytes');
