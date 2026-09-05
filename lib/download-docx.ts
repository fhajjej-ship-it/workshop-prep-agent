import { AlignmentType, Document, Footer, HeadingLevel, LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType } from 'docx';
import { documentBlockContent, packExportBlocks } from './download';
import type { Run } from './types';

export async function packDocx(run: Run): Promise<Buffer> {
  const children = packExportBlocks(run).flatMap(block => {
    if (block.kind === 'timeline' && block.timeline) {
      const tableWidth = 9746;
      let assignedWidth = 0;
      const widths = block.timeline.segments.map((segment, index) => {
        const width = index === block.timeline!.segments.length - 1
          ? tableWidth - assignedWidth
          : Math.round(tableWidth * segment.minutes / block.timeline!.totalMinutes);
        assignedWidth += width;
        return width;
      });
      return [
        new Paragraph({ keepNext: true, spacing: { before: 40, after: 35 }, children: [new TextRun({ text: 'Session timeline', bold: true, size: 20, color: '22262B' })] }),
        new Paragraph({ keepNext: true, spacing: { after: 70, line: 220 }, children: [new TextRun({ text: documentBlockContent(block), size: 16, color: '656B73' })] }),
        new Table({
          width: { size: tableWidth, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
          rows: [new TableRow({ cantSplit: true, children: block.timeline.segments.map((segment, index) => new TableCell({
            width: { size: widths[index], type: WidthType.DXA }, shading: { fill: segment.color.slice(1), type: ShadingType.CLEAR },
            margins: { marginUnitType: WidthType.DXA, top: 80, bottom: 80, left: 30, right: 30 }, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0, line: 190 }, children: [
              new TextRun({ text: String(segment.number).padStart(2, '0'), bold: true, size: 15, color: segment.textColor.slice(1) }),
              new TextRun({ text: `${segment.minutes} min`, break: 1, bold: true, size: 15, color: segment.textColor.slice(1) }),
            ] })],
          })) })],
        }),
      ];
    }
    const heading = block.kind === 'title' ? HeadingLevel.TITLE : block.kind === 'heading' ? HeadingLevel.HEADING_1 : block.kind === 'subheading' ? HeadingLevel.HEADING_2 : undefined;
    return [new Paragraph({
      heading, pageBreakBefore: block.pageBreakBefore, keepNext: Boolean(heading || block.keepWithNext),
      spacing: { before: heading ? 180 : 0, after: heading ? 110 : block.kind === 'meta' || block.kind === 'source' ? 50 : 90, line: 280 },
      ...(block.kind === 'quote' ? { indent: { left: 240, right: 120 } } : {}),
      ...(block.kind === 'bullet' ? { bullet: { level: 0 } } : {}),
      ...(block.kind === 'number' ? { numbering: { reference: 'workshop-numbering', level: 0 } } : {}),
      children: documentBlockContent(block).split(/\r\n|\r|\n/).map((text, index) => new TextRun({ text, ...(index ? { break: 1 } : {}),
        color: heading ? '000000' : block.kind === 'quote' || block.kind === 'source' ? '51555C' : '22262B', italics: block.kind === 'source' })),
    })];
  });
  const document = new Document({
    title: run.pack!.title, creator: 'Workshop Prep Agent', description: 'Saved workshop pack for human review',
    styles: { default: {
      document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 100, line: 290 } } },
      title: { run: { size: 48, bold: true }, paragraph: { keepNext: true } },
      heading1: { run: { size: 34, bold: true }, paragraph: { keepNext: true } },
      heading2: { run: { size: 25, bold: true }, paragraph: { keepNext: true } },
    } },
    numbering: { config: [{ reference: 'workshop-numbering', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 240 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Human review required · Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: '656B73' })] })] }) },
      children,
    }],
  });
  return Packer.toBuffer(document);
}
