import type PDFDocument from 'pdfkit';

type DocumentTable = { headers: string[]; rows: string[][] };

/** Wrap cells before drawing so PDFKit cannot silently start a page inside a grid. */
export function layoutPdfTable(doc: PDFKit.PDFDocument, table: DocumentTable, width: number) {
  const fontSize = 9;
  const padding = 6;
  const columnWidth = width / table.headers.length;
  const cellWidth = columnWidth - padding * 2;
  const wrap = (text: string, bold: boolean) => {
    doc.font(bold ? 'Bold' : 'Body').fontSize(fontSize);
    return text.split(/\r\n|\r|\n/).flatMap(paragraph => {
      const lines: string[] = [];
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        if (line && doc.widthOfString(`${line} ${word}`) <= cellWidth) { line += ` ${word}`; continue; }
        if (line) { lines.push(line); line = ''; }
        for (const character of word) {
          if (line && doc.widthOfString(line + character) > cellWidth) { lines.push(line); line = ''; }
          line += character;
        }
      }
      lines.push(line);
      return lines;
    });
  };
  const headers = table.headers.map(text => wrap(text, true));
  const rows = table.rows.map(row => row.map(text => wrap(text, false)));
  doc.font('Body').fontSize(fontSize);
  const lineHeight = doc.currentLineHeight(true) + 2;
  const lineCount = (row: string[][]) => Math.max(1, ...row.map(cell => cell.length));
  const rowHeight = (row: string[][]) => lineCount(row) * lineHeight + padding * 2;
  return { headers, rows, fontSize, padding, columnWidth, cellWidth, lineHeight, lineCount, rowHeight };
}

export function drawPdfTable(doc: InstanceType<typeof PDFDocument>, table: DocumentTable, x: number, width: number) {
  const layout = layoutPdfTable(doc, table, width);
  const { headers, rows, fontSize, padding, columnWidth, cellWidth, lineHeight, lineCount, rowHeight } = layout;
  const pageTop = 54;
  const pageBottom = () => doc.page.height - 54;
  const oversizedHeader = rowHeight(headers) > pageBottom() - pageTop - lineHeight - padding * 2;
  // Keep every original header line, but use a short repeat if the header itself spans pages.
  const repeatedHeaders = oversizedHeader ? headers.map(cell => cell.slice(0, 3)) : headers;
  const headerHeight = rowHeight(repeatedHeaders);
  const drawRow = (row: string[][], offset: number, count: number, header: boolean, alternate = false) => {
    const y = doc.y;
    const height = count * lineHeight + padding * 2;
    row.forEach((cell, column) => {
      const left = x + column * columnWidth;
      doc.rect(left, y, columnWidth, height).fillAndStroke(header ? '#EAF0F3' : alternate ? '#F8FAFB' : '#FFFFFF', '#C2CDD4');
      doc.font(header ? 'Bold' : 'Body').fontSize(fontSize).fillColor('#22262B');
      cell.slice(offset, offset + count).forEach((line, index) => {
        doc.text(line, left + padding, y + padding + index * lineHeight, { width: cellWidth, lineBreak: false });
      });
    });
    doc.y = y + height;
  };
  doc.lineWidth(0.5);
  if (oversizedHeader) {
    let offset = 0;
    while (offset < lineCount(headers)) {
      const availableLines = Math.floor((pageBottom() - doc.y - padding * 2) / lineHeight);
      if (availableLines < 1) { doc.addPage(); continue; }
      const count = Math.min(lineCount(headers) - offset, availableLines);
      drawRow(headers, offset, count, true);
      offset += count;
      if (offset < lineCount(headers)) doc.addPage();
    }
  } else {
    // Leave room for at least the start of a body row under the first header.
    const firstRowHeight = rows[0] ? Math.min(rowHeight(rows[0]), pageBottom() - pageTop - headerHeight) : 0;
    if (doc.y + headerHeight + firstRowHeight > pageBottom()) doc.addPage();
    drawRow(headers, 0, lineCount(headers), true);
  }
  const nextPage = () => {
    doc.addPage();
    drawRow(repeatedHeaders, 0, lineCount(repeatedHeaders), true);
  };
  for (const [rowIndex, row] of rows.entries()) {
    const count = lineCount(row);
    const freshPageCapacity = pageBottom() - pageTop - headerHeight;
    // A normal row stays together. Only a row taller than one page is split.
    if (rowHeight(row) <= freshPageCapacity && doc.y + rowHeight(row) > pageBottom()) nextPage();
    let offset = 0;
    while (offset < count) {
      const availableLines = Math.floor((pageBottom() - doc.y - padding * 2) / lineHeight);
      if (availableLines < 1) { nextPage(); continue; }
      const fragmentLines = Math.min(count - offset, availableLines);
      drawRow(row, offset, fragmentLines, false, rowIndex % 2 === 1);
      offset += fragmentLines;
      if (offset < count) nextPage();
    }
  }
  doc.x = 54;
}
