import { randomUUID } from 'node:crypto';
import { getPath } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';
import { RequestError } from './http';
import { materialSchema, MAX_MATERIAL_CHARS, MAX_PDF_BYTES, MAX_PDF_PAGES } from './material-input';
import type { Material } from './types';

PDFParse.setWorker(getPath());
const MAX_UPLOAD_BYTES = MAX_PDF_BYTES + 64 * 1024;

export async function readMaterialFile(request: Request): Promise<File> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new RequestError('Choose a PDF, TXT or Markdown file.');
  if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES) throw new RequestError('Choose a file smaller than 3 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('Choose a file to upload.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new RequestError('Choose a file smaller than 3 MB.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let form: FormData;
  try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new RequestError('The file upload could not be read. Choose the file again.'); }
  const files = form.getAll('file');
  if (files.length !== 1 || !(files[0] instanceof File)) throw new RequestError('Upload one file at a time.');
  return files[0];
}

export async function extractMaterial(file: File): Promise<Material> {
  if (!file.size) throw new RequestError('This file is empty. Choose a document containing text.');
  if (file.size > MAX_PDF_BYTES) throw new RequestError('Choose a file smaller than 3 MB.', 413);
  const filename = file.name.replaceAll('\\', '/').split('/').at(-1)?.slice(0, 255) || 'Document';
  const extension = filename.split('.').at(-1)?.toLowerCase();
  if (!['pdf', 'txt', 'md'].includes(extension ?? '')) throw new RequestError('Use a PDF, TXT or Markdown file, or paste the text.');
  const data = new Uint8Array(await file.arrayBuffer());
  let content: string;
  let pageCount: number | undefined;
  if (extension === 'pdf') {
    if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') throw new RequestError('This file is not a readable PDF. Try exporting it as PDF again.');
    const parser = new PDFParse({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    try {
      const info = await parser.getInfo();
      pageCount = info.total;
      if (pageCount > MAX_PDF_PAGES) throw new RequestError(`Use a PDF with ${MAX_PDF_PAGES} pages or fewer, or paste the relevant excerpt.`, 413);
      const result = await parser.getText();
      if (result.pages.map(page => page.text.trim()).join('').length < 20) throw new RequestError('This PDF has too little readable text. For a scanned document, paste its text instead.');
      content = result.pages.map(page => `Page ${page.num}\n${page.text.trim()}`).join('\n\n');
    } catch (error) {
      if (error instanceof RequestError) throw error;
      if (error instanceof Error && error.name === 'PasswordException') throw new RequestError('This PDF is password-protected. Upload an unlocked copy or paste its text.');
      throw new RequestError('This PDF could not be read. Try an unlocked text-based PDF or paste its text.');
    } finally { await parser.destroy().catch(() => undefined); }
  } else {
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(data); }
    catch { throw new RequestError('Save this text file as UTF-8, or paste its text instead.'); }
    if (content.includes('\u0000')) throw new RequestError('This file does not contain readable plain text.');
  }
  content = content.trim();
  if (content.length > MAX_MATERIAL_CHARS) throw new RequestError(`This document exceeds ${MAX_MATERIAL_CHARS.toLocaleString()} characters. Upload a shorter excerpt or paste the relevant section.`, 413);
  if (content.length < 20) throw new RequestError('Add at least 20 characters of source text.');
  return materialSchema.parse({
    id: `source-${randomUUID()}`, title: filename.replace(/\.(pdf|txt|md)$/i, '').slice(0, 180) || 'Document',
    content, kind: extension === 'pdf' ? 'pdf' : 'text', filename, ...(pageCount ? { pageCount } : {}),
  });
}
