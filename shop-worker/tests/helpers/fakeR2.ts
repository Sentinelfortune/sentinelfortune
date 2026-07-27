import type { R2Like, R2ObjectLike, R2PutOptions } from "../../src/types";

interface StoredObject {
  data: Uint8Array;
  contentType: string;
}

export class FakeR2Bucket implements R2Like {
  private store = new Map<string, StoredObject>();

  async put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | Blob, options?: R2PutOptions): Promise<unknown> {
    let bytes: Uint8Array;
    if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else if (value instanceof Blob) {
      bytes = new Uint8Array(await value.arrayBuffer());
    } else {
      throw new Error("FakeR2Bucket.put: ReadableStream input not supported in tests — pass ArrayBuffer/Blob.");
    }
    this.store.set(key, { data: bytes, contentType: options?.httpMetadata?.contentType ?? "application/octet-stream" });
    return { key };
  }

  async get(key: string): Promise<R2ObjectLike | null> {
    const obj = this.store.get(key);
    if (!obj) return null;
    const { data } = obj;
    return {
      key,
      size: data.byteLength,
      httpEtag: `"fake-etag-${key}"`,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }),
      async arrayBuffer() {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      },
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async head(key: string): Promise<R2ObjectLike | null> {
    return this.get(key);
  }

  /** Test helper — not part of R2Like. */
  has(key: string): boolean {
    return this.store.has(key);
  }
}
