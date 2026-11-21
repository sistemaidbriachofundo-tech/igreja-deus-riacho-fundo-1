/**
 * JPEG baseline (4:4:4) para retratos e capas geométricas.
 * Ilustração sintética: não é fotografia de pessoa.
 */

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10,
  17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
];

const Q_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

const Q_CHROMA = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];

const DC_LUMA_COUNTS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_LUMA_SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const DC_CHROMA_COUNTS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_CHROMA_SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LUMA_COUNTS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
const AC_CHROMA_COUNTS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119];
const AC_LUMA_SYMBOLS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const AC_CHROMA_SYMBOLS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

function buildHuffman(counts, symbols) {
  const codes = new Map();
  let code = 0;
  let index = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let i = 0; i < counts[length - 1]; i += 1) {
      codes.set(symbols[index], [code, length]);
      index += 1;
      code += 1;
    }
    code <<= 1;
  }
  if (index !== symbols.length) throw new Error("Tabela Huffman inconsistente");
  return codes;
}

const DC_LUMA = buildHuffman(DC_LUMA_COUNTS, DC_LUMA_SYMBOLS);
const DC_CHROMA = buildHuffman(DC_CHROMA_COUNTS, DC_CHROMA_SYMBOLS);
const AC_LUMA = buildHuffman(AC_LUMA_COUNTS, AC_LUMA_SYMBOLS);
const AC_CHROMA = buildHuffman(AC_CHROMA_COUNTS, AC_CHROMA_SYMBOLS);

function scaleQuant(table, quality) {
  const q = Math.max(1, Math.min(100, quality));
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  return table.map((value) => Math.max(1, Math.min(255, Math.floor((value * scale + 50) / 100))));
}

class BitWriter {
  constructor() {
    this.bytes = [];
    this.acc = 0;
    this.n = 0;
  }

  write(value, size) {
    this.acc = (this.acc << size) | (value & ((1 << size) - 1));
    this.n += size;
    while (this.n >= 8) {
      this.n -= 8;
      const byte = (this.acc >> this.n) & 255;
      this.acc &= (1 << this.n) - 1;
      this.bytes.push(byte);
      if (byte === 0xff) this.bytes.push(0);
    }
  }

  pad() {
    if (this.n > 0) this.write((1 << (8 - this.n)) - 1, 8 - this.n);
  }
}

function marker(bytes, ...parts) {
  for (const part of parts) {
    if (typeof part === "number") bytes.push(part & 255);
    else bytes.push(...part);
  }
}

function u16(value) {
  return [(value >> 8) & 255, value & 255];
}

function dqt(bytes, id, table) {
  const zigzagged = ZIGZAG.map((index) => table[index]);
  marker(bytes, 0xff, 0xdb, ...u16(67), id, zigzagged);
}

function dht(bytes, classId, counts, symbols) {
  marker(bytes, 0xff, 0xc4, ...u16(19 + symbols.length), classId, counts, symbols);
}

function dctBlock(spatial) {
  const out = new Float64Array(64);
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      let sum = 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          sum += spatial[y * 8 + x]
            * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
            * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
        }
      }
      const cu = u === 0 ? Math.SQRT1_2 : 1;
      const cv = v === 0 ? Math.SQRT1_2 : 1;
      out[v * 8 + u] = 0.25 * cu * cv * sum;
    }
  }
  return out;
}

function category(value) {
  const abs = Math.abs(value);
  let bits = 0;
  while ((1 << bits) <= abs) bits += 1;
  return bits;
}

function amplitude(value, bits) {
  return value < 0 ? value + (1 << bits) - 1 : value;
}

function encodeBlock(writer, samples, quant, dcTable, acTable, prevDc) {
  const shifted = samples.map((value) => value - 128);
  const freq = dctBlock(shifted);
  const zz = new Array(64).fill(0);
  for (let i = 0; i < 64; i += 1) zz[i] = Math.round(freq[ZIGZAG[i]] / quant[ZIGZAG[i]]);
  const diff = zz[0] - prevDc;
  const dcBits = category(diff);
  const dcCode = dcTable.get(dcBits);
  writer.write(dcCode[0], dcCode[1]);
  if (dcBits) writer.write(amplitude(diff, dcBits), dcBits);
  let run = 0;
  for (let i = 1; i < 64; i += 1) {
    if (zz[i] === 0) {
      run += 1;
      continue;
    }
    while (run > 15) {
      const zrl = acTable.get(0xf0);
      writer.write(zrl[0], zrl[1]);
      run -= 16;
    }
    const bits = category(zz[i]);
    const symbol = (run << 4) | bits;
    const code = acTable.get(symbol);
    if (!code) throw new Error("Símbolo AC ausente");
    writer.write(code[0], code[1]);
    writer.write(amplitude(zz[i], bits), bits);
    run = 0;
  }
  if (run > 0) {
    const eob = acTable.get(0x00);
    writer.write(eob[0], eob[1]);
  }
  return zz[0];
}

export function encodeJpeg(rgb, width, height, quality = 74) {
  if (width % 8 !== 0 || height % 8 !== 0) throw new Error("Dimensão precisa ser múltipla de 8");
  if (rgb.length !== width * height * 3) throw new Error("Buffer RGB incompleto");
  const lumaQ = scaleQuant(Q_LUMA, quality);
  const chromaQ = scaleQuant(Q_CHROMA, quality);
  const bytes = [];
  marker(bytes, 0xff, 0xd8);
  marker(bytes, 0xff, 0xe0, ...u16(16), [0x4a, 0x46, 0x49, 0x46, 0], 1, 1, 0, 0, 1, 0, 1, 0, 0);
  dqt(bytes, 0, lumaQ);
  dqt(bytes, 1, chromaQ);
  marker(
    bytes,
    0xff, 0xc0, ...u16(17), 8, ...u16(height), ...u16(width), 3,
    1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
  );
  dht(bytes, 0x00, DC_LUMA_COUNTS, DC_LUMA_SYMBOLS);
  dht(bytes, 0x01, DC_CHROMA_COUNTS, DC_CHROMA_SYMBOLS);
  dht(bytes, 0x10, AC_LUMA_COUNTS, AC_LUMA_SYMBOLS);
  dht(bytes, 0x11, AC_CHROMA_COUNTS, AC_CHROMA_SYMBOLS);
  marker(bytes, 0xff, 0xda, ...u16(12), 3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0);

  const writer = new BitWriter();
  let dcY = 0;
  let dcCb = 0;
  let dcCr = 0;
  const yBlock = new Array(64);
  const cbBlock = new Array(64);
  const crBlock = new Array(64);
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const offset = ((by + y) * width + (bx + x)) * 3;
          const r = rgb[offset];
          const g = rgb[offset + 1];
          const b = rgb[offset + 2];
          const index = y * 8 + x;
          yBlock[index] = 0.299 * r + 0.587 * g + 0.114 * b;
          cbBlock[index] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          crBlock[index] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
      }
      dcY = encodeBlock(writer, yBlock, lumaQ, DC_LUMA, AC_LUMA, dcY);
      dcCb = encodeBlock(writer, cbBlock, chromaQ, DC_CHROMA, AC_CHROMA, dcCb);
      dcCr = encodeBlock(writer, crBlock, chromaQ, DC_CHROMA, AC_CHROMA, dcCr);
    }
  }
  writer.pad();
  bytes.push(...writer.bytes);
  marker(bytes, 0xff, 0xd9);
  return Buffer.from(bytes);
}

export function jpegSize(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  for (let i = 2; i < bytes.length - 8; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xc0) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
  }
  return null;
}

function hex(color) {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function put(rgb, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) return;
  const offset = (y * width + x) * 3;
  rgb[offset] = color[0];
  rgb[offset + 1] = color[1];
  rgb[offset + 2] = color[2];
}

export function paintPortrait(spec) {
  const width = 96;
  const height = 112;
  const rgb = new Uint8Array(width * height * 3);
  const bg = hex(spec.background);
  const skin = hex(spec.skin);
  const hair = hex(spec.hair);
  const shirt = hex(spec.shirt);
  const ink = [45, 32, 28];
  const radius = spec.age === "child" ? 20 : spec.age === "elder" ? 26 : 24;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color = bg;
      const body = (x - 48) ** 2 / 38 ** 2 + (y - 108) ** 2 / 30 ** 2;
      if (body <= 1) color = shirt;
      if (x > 42 && x < 54 && y > 64 && y < 88) color = skin;
      const head = (x - 48) ** 2 + (y - 46) ** 2 <= radius ** 2;
      if (head) color = skin;
      const hairLine = spec.age === "elder" ? 40 : spec.age === "child" ? 34 : 36;
      if (head && y < hairLine) color = hair;
      if (spec.hairStyle === "side" && head && x < 36 && y < 58) color = hair;
      if (Math.abs(y - 48) <= 1 && (Math.abs(x - 40) <= 2 || Math.abs(x - 56) <= 2)) color = ink;
      if (spec.age === "elder" && y === 54 && x > 42 && x < 54) color = hair;
      put(rgb, width, x, y, color);
    }
  }
  return { rgb, width, height };
}

export function paintBanner(spec) {
  const width = 640;
  const height = 360;
  const rgb = new Uint8Array(width * height * 3);
  const bg = hex(spec.background);
  const a = hex(spec.primary);
  const b = hex(spec.accent);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color = bg;
      if ((x - 180) ** 2 + (y - 180) ** 2 < 120 ** 2) color = a;
      if ((x - 430) ** 2 / 160 ** 2 + (y - 150) ** 2 / 90 ** 2 <= 1) color = b;
      if (y > 280 && y < 292) color = b;
      if (((x + y + spec.shift) % 47) === 0) color = a;
      put(rgb, width, x, y, color);
    }
  }
  return { rgb, width, height };
}

export function portraitJpeg(spec) {
  const painted = paintPortrait(spec);
  return encodeJpeg(painted.rgb, painted.width, painted.height, 72);
}

export function bannerJpeg(spec) {
  const painted = paintBanner(spec);
  return encodeJpeg(painted.rgb, painted.width, painted.height, 68);
}
