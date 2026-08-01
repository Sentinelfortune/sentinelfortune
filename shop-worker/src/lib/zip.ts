// Minimal ZIP reader for the governed product-package import.
//
// Deliberately dependency-free, like src/lib/stripe.ts and src/lib/resend.ts.
// A ZIP parser is a well-defined format problem and pulling a library into a
// Worker to read a central directory would add supply-chain surface for no
// real benefit.
//
// Scope is intentionally narrow. The importer needs to:
//   - enumerate every entry with its name, size and CRC (for inventory and
//     executable checks) without inflating anything;
//   - extract a small number of named entries (the manifest, a cover image);
//   - verify structural integrity and the CRC of what it extracts.
//
// It does NOT inflate the whole archive. A product package is mostly large
// binary deliverables that the Worker only ever streams to R2 untouched, so
// decompressing them in memory would be wasted work and a memory risk.

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  /** 0 = stored, 8 = deflate. Anything else is unsupported. */
  method: number;
  crc32: number;
  localHeaderOffset: number;
  isDirectory: boolean;
}

export class ZipError extends Error {}

// ---------------------------------------------------------------------------
// CRC-32 (IEEE), used to verify entries this reader actually extracts.
// ---------------------------------------------------------------------------

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

export class ZipArchive {
  private view: DataView;
  private bytes: Uint8Array;
  readonly entries: ZipEntry[];

  private constructor(bytes: Uint8Array, entries: ZipEntry[]) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.entries = entries;
  }

  static open(buffer: ArrayBuffer): ZipArchive {
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength < 22) throw new ZipError("File is too small to be a ZIP archive.");

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Locate the End of Central Directory record. It sits within the last
    // 64KB + 22 bytes (the comment field is at most 64KB).
    const maxScan = Math.min(bytes.byteLength, 0xffff + 22);
    let eocd = -1;
    for (let i = bytes.byteLength - 22; i >= bytes.byteLength - maxScan; i--) {
      if (i < 0) break;
      if (view.getUint32(i, true) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) throw new ZipError("Not a valid ZIP archive: no end-of-central-directory record.");

    // ZIP64 archives use sentinel values here. A product package that large is
    // out of scope, and silently misreading one would be worse than refusing.
    const entryCount = view.getUint16(eocd + 10, true);
    const centralSize = view.getUint32(eocd + 12, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    if (entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
      throw new ZipError("ZIP64 archives are not supported.");
    }
    if (eocd >= 20 && view.getUint32(eocd - 20, true) === EOCD64_LOCATOR_SIGNATURE) {
      throw new ZipError("ZIP64 archives are not supported.");
    }
    if (centralOffset + centralSize > bytes.byteLength) {
      throw new ZipError("ZIP archive is truncated: central directory extends past the end of the file.");
    }

    const decoder = new TextDecoder("utf-8");
    const entries: ZipEntry[] = [];
    let offset = centralOffset;

    for (let i = 0; i < entryCount; i++) {
      if (offset + 46 > bytes.byteLength) throw new ZipError("ZIP central directory is truncated.");
      if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
        throw new ZipError(`ZIP central directory is corrupt at entry ${i + 1}.`);
      }

      const method = view.getUint16(offset + 10, true);
      const entryCrc = view.getUint32(offset + 16, true) >>> 0;
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);

      const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

      if (localHeaderOffset + 30 > bytes.byteLength) {
        throw new ZipError(`ZIP entry "${name}" points outside the archive.`);
      }
      if (view.getUint32(localHeaderOffset, true) !== LOCAL_SIGNATURE) {
        throw new ZipError(`ZIP entry "${name}" has a corrupt local header.`);
      }

      entries.push({
        name,
        compressedSize,
        uncompressedSize,
        method,
        crc32: entryCrc,
        localHeaderOffset,
        isDirectory: name.endsWith("/"),
      });

      offset += 46 + nameLength + extraLength + commentLength;
    }

    return new ZipArchive(bytes, entries);
  }

  /** Entries that are actual files, in archive order. */
  files(): ZipEntry[] {
    return this.entries.filter((e) => !e.isDirectory);
  }

  find(name: string): ZipEntry | null {
    return this.entries.find((e) => e.name === name) ?? null;
  }

  /**
   * Inflate one entry and verify its CRC-32.
   *
   * Only called for small entries the importer must read (the manifest, a
   * cover image) — never for the whole archive.
   */
  async read(entry: ZipEntry): Promise<Uint8Array> {
    const nameLength = this.view.getUint16(entry.localHeaderOffset + 26, true);
    const extraLength = this.view.getUint16(entry.localHeaderOffset + 28, true);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;

    if (dataEnd > this.bytes.byteLength) {
      throw new ZipError(`ZIP entry "${entry.name}" is truncated.`);
    }

    const raw = this.bytes.subarray(dataStart, dataEnd);
    let out: Uint8Array;

    if (entry.method === 0) {
      out = raw.slice();
    } else if (entry.method === 8) {
      const stream = new Response(raw).body!.pipeThrough(new DecompressionStream("deflate-raw"));
      out = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new ZipError(`ZIP entry "${entry.name}" uses unsupported compression method ${entry.method}.`);
    }

    if (out.byteLength !== entry.uncompressedSize) {
      throw new ZipError(`ZIP entry "${entry.name}" failed integrity check: unexpected size.`);
    }
    if (crc32(out) !== entry.crc32) {
      throw new ZipError(`ZIP entry "${entry.name}" failed integrity check: CRC mismatch.`);
    }
    return out;
  }

  async readText(entry: ZipEntry): Promise<string> {
    return new TextDecoder("utf-8").decode(await this.read(entry));
  }
}
