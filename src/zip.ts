// Мой маленький распаковщик ZIP (EPUB — это тоже ZIP). Без сторонних библиотек: распаковку
// делает сам браузер (DecompressionStream). Защита от «zip-бомб»: ограничиваю число файлов
// и размер распакованного, лишнее не распаковываю.
//
// My tiny ZIP reader (EPUB is a ZIP too). No third-party libraries: the browser itself inflates
// (DecompressionStream). Zip-bomb protection: limits on file count and unpacked size.

const MAX_FILES = 5000;
const MAX_FILE = 64 * 1024 * 1024; // один файл внутри — не больше 64 МБ / one entry ≤ 64 MB
const MAX_TOTAL = 256 * 1024 * 1024; // всего распаковано — не больше 256 МБ / total ≤ 256 MB

export type ZipEntry = { name: string; method: number; size: number; packed: number; offset: number };

export const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

export class Zip {
  entries: ZipEntry[] = [];
  private total = 0;
  private bytes: Uint8Array;
  private view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Конец архива: ищу запись «конец каталога» с конца файла / Find the end-of-central-directory record
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (this.view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Архив повреждён');
    const count = this.view.getUint16(eocd + 10, true);
    let p = this.view.getUint32(eocd + 16, true);
    if (count > MAX_FILES) throw new Error('В архиве слишком много файлов');
    const utf8 = new TextDecoder('utf-8');
    for (let i = 0; i < count; i++) {
      if (p + 46 > bytes.length || this.view.getUint32(p, true) !== 0x02014b50) throw new Error('Архив повреждён');
      const method = this.view.getUint16(p + 10, true);
      const packed = this.view.getUint32(p + 20, true);
      const size = this.view.getUint32(p + 24, true);
      const nameLen = this.view.getUint16(p + 28, true);
      const extraLen = this.view.getUint16(p + 30, true);
      const commentLen = this.view.getUint16(p + 32, true);
      const offset = this.view.getUint32(p + 42, true);
      const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      this.entries.push({ name, method, size, packed, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  find(name: string) {
    const n = name.replace(/^\.?\//, '');
    return this.entries.find((e) => e.name === n) ?? this.entries.find((e) => e.name.toLowerCase() === n.toLowerCase());
  }

  // Распаковать один файл / Unpack one entry
  async read(entry: ZipEntry): Promise<Uint8Array> {
    if (entry.size > MAX_FILE) throw new Error('Файл внутри архива слишком большой');
    const h = entry.offset;
    if (this.view.getUint32(h, true) !== 0x04034b50) throw new Error('Архив повреждён');
    const start = h + 30 + this.view.getUint16(h + 26, true) + this.view.getUint16(h + 28, true);
    const data = this.bytes.subarray(start, start + entry.packed);
    let out: Uint8Array;
    if (entry.method === 0) out = data.slice();
    else if (entry.method === 8) out = await inflate(data, Math.min(MAX_FILE, MAX_TOTAL - this.total));
    else throw new Error('Неизвестный способ сжатия в архиве');
    this.total += out.length;
    if (this.total > MAX_TOTAL) throw new Error('Архив распаковывается в слишком большой объём');
    return out;
  }

  async text(name: string) {
    const e = this.find(name);
    return e ? new TextDecoder('utf-8').decode(await this.read(e)) : null;
  }
}

// Распаковка deflate средствами браузера, с остановкой при превышении лимита
// Browser-native deflate, stopping once the limit is exceeded
async function inflate(data: Uint8Array, limit: number) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Архив распаковывается в слишком большой объём');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out;
}
