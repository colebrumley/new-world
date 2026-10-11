// R-1024: a small PNG writer for the manual's sprites (test/unit/wiki/images.test.ts), and a reader
// for what it writes. Only one shape of file: 8-bit RGBA, no interlace, filter 0 on every row, a
// single IDAT. The reader refuses anything else; pngSize reads the IHDR of any PNG.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A PNG of `rgba` (width x height x 4 bytes, rows top to bottom). */
export function encodePng(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`encodePng: ${rgba.length} bytes for ${width} x ${height}`);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, deflate, filter method 0, no interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}

/** The width and height in a PNG's IHDR. */
export function pngSize(buffer: Uint8Array): { width: number; height: number } {
  const bytes = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The pixels of a PNG written by encodePng (any number of IDAT chunks, but only filter 0 and 8-bit RGBA). */
export function decodePng(buffer: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const bytes = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const { width, height } = pngSize(bytes);
  const header = bytes.subarray(24, 29);
  if (header[0] !== 8 || header[1] !== 6 || header[2] !== 0 || header[3] !== 0 || header[4] !== 0) throw new Error('decodePng: only 8-bit RGBA without interlace');
  const data: Buffer[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    if (type === 'IDAT') data.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new Error('decodePng: wrong amount of image data');
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    if (raw[y * (stride + 1)] !== 0) throw new Error(`decodePng: row ${y} uses a filter`);
    rgba.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return { width, height, rgba };
}
