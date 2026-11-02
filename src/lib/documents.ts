import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, StandardFonts, rgb } from 'pdf-lib';
import { strToU8, zip } from 'fflate';
import type { DocumentInput, PackageResult, PreparedDocument, Requirement, ValidationIssue } from '../types';
import { formatBytes } from './files.ts';
export { formatBytes, downloadBytes } from './files.ts';

export const LIMITS = { maxFileBytes: 20_000_000, maxTotalBytes: 50_000_000, maxPages: 100, maxFiles: 20 } as const;
const MAX_PIXELS = 40_000_000;
type FileKind = 'pdf' | 'jpg' | 'png';
const mimeTypes = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' };
const reservedNames = new Set(['checklist.txt', 'manifest.json']);
const issue = (code: string, message: string): ValidationIssue => ({ code, message });

function kindOf(bytes: Uint8Array): FileKind {
  if (bytes.length >= 8 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'pdf';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return 'png';
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  throw new Error('Isi berkas bukan PDF, JPG, atau PNG yang didukung. Ekspor ulang dari aplikasi asal.');
}

function validateConfig(req: Requirement): string | undefined {
  if (!req.id?.trim() || !req.title?.trim()) return 'Nama kebutuhan tidak boleh kosong.';
  if (req.format !== 'pdf' && req.format !== 'original') return 'Pilih format PDF atau format asli.';
  if (typeof req.required !== 'boolean') return 'Status wajib atau opsional tidak valid.';
  if (!Number.isFinite(req.maxSizeMB) || req.maxSizeMB <= 0 || req.maxSizeMB > 20) return 'Batas ukuran harus lebih dari 0 dan paling besar 20 MB.';
  if (req.maxPages !== undefined && (!Number.isInteger(req.maxPages) || req.maxPages < 1 || req.maxPages > LIMITS.maxPages)) return 'Batas halaman harus bilangan bulat 1–100.';
  if (!req.outputName?.trim() || req.outputName.length > 160) return 'Isi nama hasil sepanjang 1–160 karakter.';
  try { outputFilename(req.outputName, 'pdf'); }
  catch (error) { return error instanceof Error ? error.message : 'Nama hasil tidak valid.'; }
  return undefined;
}

function outputFilename(name: string, kind: FileKind): string {
  const basename = name.normalize('NFKC').replace(/\.(pdf|jpe?g|png)$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/\s+/g, ' ').replace(/^[.\s-]+|[.\s-]+$/g, '');
  if (!basename || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(basename)) throw new Error('Nama hasil tidak dapat digunakan. Pilih nama sederhana, misalnya CV-Nama.');
  const filename = `${basename}.${kind}`;
  if (new TextEncoder().encode(filename).length > 240) throw new Error('Nama hasil terlalu panjang untuk disimpan. Pendekkan nama, terutama jika memakai emoji.');
  if (reservedNames.has(filename.toLowerCase())) throw new Error('Nama hasil dipakai untuk daftar pemeriksaan. Gunakan nama lain.');
  return filename;
}

function exifOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = bytes[0] === 73 && bytes[1] === 73;
  if (bytes.length < 8 || (!littleEndian && !(bytes[0] === 77 && bytes[1] === 77)) || view.getUint16(2, littleEndian) !== 42) throw new Error('Metadata orientasi gambar rusak. Ekspor ulang gambar tanpa metadata.');
  const offset = view.getUint32(4, littleEndian);
  if (offset + 2 > bytes.length) throw new Error('Metadata orientasi gambar terpotong. Ekspor ulang gambar.');
  const count = view.getUint16(offset, littleEndian);
  if (offset + 2 + count * 12 > bytes.length) throw new Error('Metadata orientasi gambar terpotong. Ekspor ulang gambar.');
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    if (view.getUint16(entry, littleEndian) !== 0x112) continue;
    const orientation = view.getUint16(entry + 8, littleEndian);
    if (view.getUint16(entry + 2, littleEndian) !== 3 || view.getUint32(entry + 4, littleEndian) !== 1 || orientation < 1 || orientation > 8) throw new Error('Metadata orientasi gambar tidak valid. Ekspor ulang gambar.');
    return orientation;
  }
  return 1;
}

function imageDimensions(bytes: Uint8Array, kind: 'jpg' | 'png'): { width: number; height: number; orientation: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let orientation = 1;
  if (kind === 'png') {
    if (bytes.length < 45 || view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Struktur PNG tidak lengkap. Ekspor ulang gambar.');
    width = view.getUint32(16);
    height = view.getUint32(20);
    let offset = 8;
    let foundEnd = false;
    let foundData = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (offset + 12 + length > bytes.length) throw new Error('Data PNG terpotong. Pilih berkas yang lengkap.');
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      foundData ||= type === 'IDAT';
      if (type === 'eXIf') orientation = exifOrientation(bytes.subarray(offset + 8, offset + 8 + length));
      if (type === 'IEND') { foundEnd = length === 0 && offset + 12 === bytes.length; break; }
      offset += length + 12;
    }
    if (!foundEnd || !foundData) throw new Error('Data PNG tidak lengkap. Ekspor ulang gambar.');
  } else {
    if (bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new Error('Data JPG terpotong. Pilih berkas yang lengkap.');
    let offset = 2;
    let foundScan = false;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) throw new Error('Struktur JPG tidak valid. Ekspor ulang gambar.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda) { foundScan = true; break; }
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error('Data JPG terpotong. Pilih berkas yang lengkap.');
      if (marker === 0xe1 && length >= 8 && String.fromCharCode(...bytes.slice(offset + 2, offset + 8)) === 'Exif\0\0') orientation = exifOrientation(bytes.subarray(offset + 8, offset + length));
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) throw new Error('Dimensi JPG tidak valid.');
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
      }
      offset += length;
    }
    if (!foundScan) throw new Error('Data gambar JPG tidak lengkap. Ekspor ulang gambar.');
  }
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('Gambar harus memiliki dimensi valid, paling besar 40 megapiksel. Perkecil gambar terlebih dahulu.');
  return { width, height, orientation };
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  if (!new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 1024))).includes('%%EOF')) throw new Error('PDF terpotong atau tidak lengkap. Ekspor ulang dari aplikasi asal.');
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
  } catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message)) throw new Error('PDF terkunci atau terenkripsi belum didukung. Gunakan salinan tanpa kata sandi yang memang boleh Anda akses.');
    throw new Error('PDF tidak dapat dibaca. Ekspor ulang PDF dari aplikasi asal.');
  }
  const visited = new Set<unknown>();
  function hasSignature(value: unknown): boolean {
    if (value instanceof PDFRef) value = pdf.context.lookup(value);
    if (!value || visited.has(value)) return false;
    visited.add(value);
    if (value instanceof PDFDict) {
      if (value.lookup(PDFName.of('FT'))?.toString() === '/Sig' || value.lookup(PDFName.of('Type'))?.toString() === '/Sig' || value.has(PDFName.of('ByteRange'))) return true;
      return value.entries().some(([, item]) => hasSignature(item));
    }
    return value instanceof PDFArray && value.asArray().some(hasSignature);
  }
  if (pdf.context.enumerateIndirectObjects().some(([, object]) => hasSignature(object))) throw new Error('PDF dengan tanda tangan digital atau kolom tanda tangan belum didukung. Simpan berkas asli; jangan ubah tanda tangannya.');
  const count = pdf.getPageCount();
  if (count < 1 || count > LIMITS.maxPages) throw new Error('PDF harus berisi 1–100 halaman. Pisahkan dokumen yang lebih panjang.');
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 20_000 || height > 20_000) throw new Error('Ukuran halaman PDF tidak didukung. Ekspor ulang dengan ukuran kertas biasa.');
  }
  return pdf;
}

async function validateImage(bytes: Uint8Array, kind: 'jpg' | 'png'): Promise<number> {
  const { orientation } = imageDimensions(bytes, kind);
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mimeTypes[kind] })); }
    catch { throw new Error('Gambar tidak dapat dibaca. Ekspor ulang sebagai JPG atau PNG.'); }
    bitmap.close();
  }
  const check = await PDFDocument.create();
  try { await (kind === 'png' ? check.embedPng(bytes) : check.embedJpg(bytes)); }
  catch { throw new Error('Gambar rusak atau formatnya tidak didukung. Ekspor ulang sebagai JPG atau PNG.'); }
  return orientation;
}

async function readFile(file: File): Promise<{ bytes: Uint8Array; kind: FileKind; pdf?: PDFDocument; orientation?: number }> {
  if (!file.size || file.size > LIMITS.maxFileBytes) throw new Error(`${file.name}: ukuran harus lebih dari 0 dan paling besar 20 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = kindOf(bytes);
  const extension = file.name.split('.').at(-1)?.toLowerCase().replace('jpeg', 'jpg');
  if (extension !== kind) throw new Error(`${file.name}: ekstensi tidak sesuai isi berkas. Ekspor ulang; mengganti nama ekstensi saja tidak mengubah format.`);
  if (file.type && file.type !== 'application/octet-stream' && file.type !== mimeTypes[kind] && !(kind === 'jpg' && file.type === 'image/jpg')) throw new Error(`${file.name}: jenis berkas tidak cocok dengan isinya. Ekspor ulang dari aplikasi asal.`);
  if (kind === 'pdf') return { bytes, kind, pdf: await loadPdf(bytes) };
  const orientation = await validateImage(bytes, kind);
  return { bytes, kind, orientation };
}

function removePageActions(pdf: PDFDocument): void {
  for (const page of pdf.getPages()) {
    page.node.delete(PDFName.of('AA'));
    const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    for (const ref of annotations?.asArray() ?? []) {
      const annotation = pdf.context.lookup(ref);
      if (annotation instanceof PDFDict) {
        annotation.delete(PDFName.of('A'));
        annotation.delete(PDFName.of('AA'));
      }
    }
  }
}

async function prepareDocument({ requirement: req, files }: DocumentInput): Promise<PreparedDocument> {
  if (req.format === 'original' && files.length !== 1) throw new Error('Format asli hanya menerima satu berkas. Pilih PDF untuk menggabungkan beberapa berkas.');
  const sources = [];
  let totalPages = 0;
  for (const file of files) {
    const source = await readFile(file);
    totalPages += source.pdf?.getPageCount() ?? 1;
    if (totalPages > LIMITS.maxPages) throw new Error('Gabungan paling besar 100 halaman. Kurangi berkas dalam kebutuhan ini.');
    sources.push(source);
  }
  const kind: FileKind = req.format === 'pdf' ? 'pdf' : sources[0].kind;
  let bytes = sources[0].bytes;
  if (req.format === 'pdf' && !(sources.length === 1 && sources[0].kind === 'pdf')) {
    const merged = await PDFDocument.create();
    for (const source of sources) {
      if (source.pdf) {
        const acroForm = source.pdf.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
        if (acroForm?.has(PDFName.of('XFA'))) throw new Error('PDF formulir XFA tidak digabungkan agar isian tidak hilang. Ekspor salinan PDF datar terlebih dahulu, atau gunakan berkas ini sendiri.');
        const fields = source.pdf.getForm().getFields();
        if (fields.length > 0) throw new Error('PDF formulir interaktif tidak digabungkan agar isian tidak hilang. Ekspor salinan PDF datar terlebih dahulu, atau gunakan berkas ini sendiri.');
        for (const page of await merged.copyPages(source.pdf, source.pdf.getPageIndices())) merged.addPage(page);
      } else {
        const embedded = await (source.kind === 'png' ? merged.embedPng(source.bytes) : merged.embedJpg(source.bytes));
        const scale = Math.min(1, 1440 / Math.max(embedded.width, embedded.height));
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        const orientation = source.orientation ?? 1;
        // EXIF uses top-left image coordinates; PDF uses bottom-left page coordinates.
        const [x, y, width, height, rotation] = [
          [0, 0, w, h, 0], [w, 0, -w, h, 0], [w, h, w, h, 180], [0, h, w, -h, 0],
          [h, w, -w, h, 90], [0, w, w, h, 270], [0, 0, w, -h, 90], [h, 0, w, h, 90],
        ][orientation - 1];
        const page = merged.addPage(orientation >= 5 ? [h, w] : [w, h]);
        page.drawImage(embedded, { x, y, width, height, rotate: degrees(rotation) });
      }
    }
    removePageActions(merged);
    bytes = new Uint8Array(await merged.save());
  }
  const finalKind = kindOf(bytes);
  if (finalKind !== kind) throw new Error('Format hasil tidak sesuai. Hasil tidak dapat diunduh.');
  const pageCount = finalKind === 'pdf' ? (await loadPdf(bytes)).getPageCount() : 1;
  if (finalKind !== 'pdf') await validateImage(bytes, finalKind);
  const issues: ValidationIssue[] = [];
  if (bytes.length > req.maxSizeMB * 1_000_000) issues.push(issue('size', `Hasil ${formatBytes(bytes.length)} melewati batas ${formatBytes(req.maxSizeMB * 1_000_000)}. Perkecil berkas dari aplikasi asal atau ubah batas sesuai persyaratan sebenarnya.`));
  if (bytes.length > LIMITS.maxFileBytes) issues.push(issue('file-limit', 'Hasil lebih dari 20 MB. Pisahkan menjadi beberapa kebutuhan.'));
  if (req.maxPages !== undefined && pageCount > req.maxPages) issues.push(issue('pages', `Hasil ${pageCount} halaman melewati batas ${req.maxPages} halaman. Kurangi berkas atau sesuaikan persyaratan.`));
  return { requirementId: req.id, filename: outputFilename(req.outputName, kind), mimeType: mimeTypes[kind], bytes, pageCount, sourceNames: files.map(file => file.name), issues };
}

export async function preparePackage(inputs: DocumentInput[]): Promise<PackageResult> {
  const result: PackageResult = { documents: [], issues: [], ready: false };
  if (!inputs.length) { result.issues.push(issue('empty', 'Tambahkan setidaknya satu kebutuhan dan satu berkas.')); return result; }
  const allFiles = inputs.flatMap(input => input.files);
  if (inputs.length > LIMITS.maxFiles || allFiles.length > LIMITS.maxFiles) result.issues.push(issue('file-count', 'Satu paket paling besar 20 kebutuhan dan 20 berkas. Kurangi jumlahnya.'));
  if (allFiles.reduce((total, file) => total + file.size, 0) > LIMITS.maxTotalBytes) result.issues.push(issue('total-size', 'Ukuran semua berkas paling besar 50 MB. Pisahkan menjadi beberapa paket.'));
  if (result.issues.length) return result;
  const ids = new Set<string>();
  for (const input of inputs) {
    const { requirement: req, files } = input;
    const configError = validateConfig(req);
    if (configError) { result.issues.push(issue('config', `${req.title || 'Kebutuhan'}: ${configError}`)); continue; }
    if (ids.has(req.id)) { result.issues.push(issue('duplicate-id', `${req.title}: ID kebutuhan duplikat. Buat ulang kebutuhan ini.`)); continue; }
    ids.add(req.id);
    if (!files.length) {
      if (req.required) result.issues.push(issue('missing', `${req.title}: berkas wajib belum ditambahkan.`));
      continue;
    }
    try { result.documents.push(await prepareDocument(input)); }
    catch (error) { result.issues.push(issue('file', `${req.title}: ${error instanceof Error ? error.message : 'Berkas tidak dapat diproses. Coba berkas lain.'}`)); }
  }
  const names = new Set<string>();
  for (const document of result.documents) {
    const name = document.filename.toLocaleLowerCase('en-US');
    if (names.has(name)) document.issues.push(issue('duplicate-name', `Nama ${document.filename} dipakai lebih dari sekali. Ubah salah satu nama hasil.`));
    names.add(name);
  }
  if (result.documents.reduce((total, document) => total + document.bytes.length, 0) > LIMITS.maxTotalBytes) result.issues.push(issue('total-output-size', 'Ukuran semua hasil lebih dari 50 MB setelah konversi. Pisahkan menjadi beberapa paket.'));
  if (!result.documents.length && !result.issues.length) result.issues.push(issue('empty', 'Belum ada berkas untuk diproses. Tambahkan minimal satu berkas.'));
  result.ready = result.documents.length > 0 && result.issues.length === 0 && result.documents.every(document => document.issues.length === 0);
  return result;
}

export async function createArchive(result: PackageResult): Promise<Uint8Array> {
  if (!result.ready || result.issues.length || !result.documents.length || result.documents.some(document => document.issues.length)) throw new Error('Selesaikan semua masalah pemeriksaan sebelum mengunduh paket.');
  if (result.documents.length > LIMITS.maxFiles || result.documents.reduce((total, doc) => total + doc.bytes.length, 0) > LIMITS.maxTotalBytes) throw new Error('Paket melampaui batas 20 berkas atau 50 MB. Periksa ulang paket.');
  const entries: Record<string, Uint8Array> = Object.create(null);
  const names = new Set<string>();
  for (const doc of result.documents) {
    const lower = doc.filename.toLowerCase();
    if (names.has(lower) || reservedNames.has(lower) || /[\\/\u0000-\u001f]/.test(doc.filename) || !doc.filename.trim()) throw new Error('Nama berkas dalam paket tidak aman atau duplikat. Periksa ulang paket.');
    names.add(lower);
    entries[doc.filename] = doc.bytes;
  }
  const manifest = result.documents.map(({ filename, bytes, pageCount, sourceNames }) => ({ filename, sizeBytes: bytes.length, pageCount, sourceNames }));
  entries['manifest.json'] = strToU8(JSON.stringify({ app: 'BerkasSiap', version: 1, note: 'Lulus pemeriksaan teknis terhadap persyaratan yang dimasukkan; bukan jaminan diterima.', documents: manifest }, null, 2));
  entries['checklist.txt'] = strToU8(['BERKASSIAP — DAFTAR BERKAS', '', ...manifest.map(doc => `[OK] ${doc.filename} | ${formatBytes(doc.sizeBytes)} | ${doc.pageCount} halaman`), '', 'Periksa kembali isi, orientasi, dan keterbacaan setiap berkas.', 'Pemeriksaan teknis ini bukan jaminan diterima dan tidak memverifikasi keaslian dokumen.', 'ZIP untuk menyimpan atau membagikan paket. Portal tujuan mungkin meminta berkas satu per satu.', 'Berkas asli Anda tidak diubah.'].join('\n'));
  return new Promise((resolve, reject) => zip(entries, { level: 0 }, (error, bytes) => error ? reject(new Error('Paket ZIP gagal dibuat. Coba unduh berkas satu per satu.')) : resolve(bytes)));
}

export async function createDemoFiles(): Promise<File[]> {
  const files: File[] = [];
  for (const [name, title, lines] of [
    ['contoh-cv.pdf', 'CV CONTOH', ['DOKUMEN SIMULASI - bukan data pribadi nyata', 'Nama: Raka Contoh', 'Bidang: Administrasi', 'Pengalaman: Menyusun arsip dan laporan simulasi.']],
    ['contoh-surat-lamaran.pdf', 'SURAT LAMARAN CONTOH', ['DOKUMEN SIMULASI - bukan lamaran sebenarnya', 'Kepada Tim Rekrutmen Contoh,', 'Dokumen ini dibuat untuk mencoba BerkasSiap.', 'Silakan ganti dengan berkas milik Anda sendiri.']],
  ] as const) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(title, { x: 50, y: 760, size: 23, font, color: rgb(0.12, 0.27, 0.24) });
    lines.forEach((line, index) => page.drawText(line, { x: 50, y: 710 - index * 30, size: 12, font }));
    files.push(new File([new Uint8Array(await pdf.save())], name, { type: 'application/pdf' }));
  }
  return files;
}
