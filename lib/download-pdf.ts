import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { documentBlockContent, documentBlockText, packExportBlocks } from './download';
import type { Run } from './types';

export async function packPdf(run: Run): Promise<Buffer> {
  const font = async (filename: string) => {
    try { return await readFile(path.join(process.cwd(), 'assets', 'fonts', filename)); }
    catch { return readFile(fileURLToPath(new URL(`../assets/fonts/${filename}`, import.meta.url))); }
  };
  const [regular, bold] = await Promise.all([
    font('NotoSans-Regular.ttf'), font('NotoSans-Bold.ttf'),
  ]);
  const doc = new PDFDocument({ size: 'A4', margin: 54, bufferPages: true,
    info: { Title: run.pack!.title, Author: 'Workshop Prep Agent', Subject: 'Saved workshop pack for human review' } });
  doc.registerFont('Body', regular); doc.registerFont('Bold', bold);
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const blocks = packExportBlocks(run);
  const geometry = (block: (typeof blocks)[number]) => {
    const heading = ['title', 'heading', 'subheading'].includes(block.kind);
    const size = block.kind === 'title' ? 25 : block.kind === 'heading' ? 16 : block.kind === 'subheading' ? 11.5 : block.kind === 'source' ? 9 : block.kind === 'timeline' ? 7.2 : 10.5;
    const listed = block.kind === 'bullet' || block.kind === 'number';
    const inset = block.kind === 'quote' ? 12 : 0;
    doc.font(heading ? 'Bold' : 'Body').fontSize(size);
    const width = doc.page.width - 108 - inset - (listed ? 18 : 0);
    const text = listed ? documentBlockContent(block) : documentBlockText(block);
    const textHeight = doc.heightOfString(text, { width, lineGap: block.kind === 'timeline' ? 1 : 3 });
    const height = block.kind === 'timeline' ? 61 + textHeight : textHeight;
    const after = block.kind === 'title' ? 10 : heading ? 6 : block.kind === 'timeline' ? 8 : block.kind === 'meta' || block.kind === 'source' ? 3 : 5;
    return { heading, size, listed, inset, width, text, height, after };
  };
  const groupHeight = (start: number) => {
    let height = 0;
    for (let index = start; index < blocks.length; index++) {
      const current = blocks[index];
      const layout = geometry(current);
      height += (layout.heading ? 10 : 0) + layout.height + layout.after;
      if (!current.keepWithNext) break;
    }
    return height;
  };
  for (const [index, block] of blocks.entries()) {
    const layout = geometry(block);
    const { heading, size, listed, inset, width, text, height } = layout;
    if (block.pageBreakBefore) doc.addPage();
    const keptHeight = groupHeight(index);
    const pageCapacity = doc.page.height - 108;
    if (keptHeight <= pageCapacity && doc.y + keptHeight > doc.page.height - 54) doc.addPage();
    doc.font(heading ? 'Bold' : 'Body').fontSize(size).fillColor(block.kind === 'title' ? '#3D235A' : block.kind === 'quote' || block.kind === 'source' ? '#51555C' : '#22262B');
    const before = heading && doc.y > 54 ? 10 : 0;
    const followingSpace = block.minimumFollowingSpace ?? (block.kind === 'heading' ? 72 : 32);
    if (heading && doc.y + before + height + followingSpace > doc.page.height - 54) doc.addPage();
    else doc.y += before;
    if (block.kind === 'timeline' && block.timeline) {
      const y = doc.y;
      const barY = y + 17;
      const barHeight = 28;
      doc.font('Bold').fontSize(9).fillColor('#22262B').text('Session timeline', 54, y, { width, lineBreak: false });
      let segmentX = 54;
      for (const [segmentIndex, segment] of block.timeline.segments.entries()) {
        const segmentWidth = segmentIndex === block.timeline.segments.length - 1
          ? 54 + width - segmentX
          : width * segment.minutes / block.timeline.totalMinutes;
        doc.rect(segmentX, barY, segmentWidth, barHeight).fill(segment.color);
        const labelSize = Math.max(5, Math.min(7.5, segmentWidth / 5));
        doc.font('Bold').fontSize(labelSize).fillColor(segment.textColor)
          .text(String(segment.number).padStart(2, '0'), segmentX + 2, barY + 3, { width: Math.max(1, segmentWidth - 4), align: 'center', lineBreak: false })
          .text(`${segment.minutes}m`, segmentX + 2, barY + 15, { width: Math.max(1, segmentWidth - 4), align: 'center', lineBreak: false });
        segmentX += segmentWidth;
      }
      const boundaries = [0, ...block.timeline.segments.map(segment => segment.end)];
      doc.font('Body').fontSize(7).fillColor('#656B73');
      boundaries.forEach((minute, boundaryIndex) => {
        const offset = width * minute / block.timeline!.totalMinutes;
        const first = boundaryIndex === 0;
        const last = boundaryIndex === boundaries.length - 1;
        doc.text(String(minute).padStart(2, '0'), 54 + offset - (first ? 0 : last ? 26 : 13), barY + 32,
          { width: first || last ? 26 : 26, align: first ? 'left' : last ? 'right' : 'center', lineBreak: false });
      });
      doc.font('Body').fontSize(size).fillColor('#656B73').text(text, 54, barY + 45, { width, lineGap: 1 });
      doc.y = y + height;
    } else if (block.kind === 'quote') {
      if (doc.y + height + 12 > doc.page.height - 54) doc.addPage();
      const y = doc.y;
      doc.roundedRect(54 + inset - 7, y - 4, width + 14, height + 8, 4).fill('#F4F0F7');
      doc.fillColor('#51555C').text(text, 54 + inset, y, { width, lineGap: 3 });
    } else if (listed) {
      const firstLinesHeight = Math.min(height, size * 2.8);
      if (doc.y + firstLinesHeight > doc.page.height - 54) doc.addPage();
      const y = doc.y;
      doc.text(block.kind === 'bullet' ? '•' : `${block.number}.`, 54, y, { width: 16, lineBreak: false });
      doc.y = y;
      doc.text(text, 72, y, { width, lineGap: 3, paragraphGap: 3 });
    } else doc.text(text, 54 + inset, doc.y, { width, lineGap: 3, paragraphGap: 3 });
    if (block.kind === 'title') {
      doc.moveTo(54, doc.y + 2).lineTo(118, doc.y + 2).lineWidth(2).strokeColor('#A975CF').stroke();
      doc.y += 8;
    } else doc.y += layout.after;
  }
  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index++) {
    doc.switchToPage(index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Body').fontSize(8).fillColor('#656B73').text(`Workshop Prep Agent · Human review required · ${index + 1} / ${pages.count}`, 54, doc.page.height - 34, { width: doc.page.width - 108, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return output;
}
