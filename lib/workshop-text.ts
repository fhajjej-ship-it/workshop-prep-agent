export type WorkshopTextBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

type WorksheetTable = { headers: string[]; rows: string[][] };
const blankCurrencyPrompt = /^\[\s*(SEK|NOK|DKK|EUR|USD|GBP|CHF|CAD|AUD|NZD|JPY|CNY|INR)\s*_{2,}\s*\]$/;
const currencyUnit = (text: string) => blankCurrencyPrompt.exec(text.trim())?.[1];

/** Only blank response columns indicate a participant worksheet, not a filled answer table. */
export function isBlankWorksheetTable(table: WorksheetTable): boolean {
  return table.headers.length > 1 && table.rows.length > 0
    && table.rows.every(row => row.length === table.headers.length
      && row.slice(1).every(cell => !cell.trim() || /^\[\s*\]$/.test(cell.trim()) || currencyUnit(cell)));
}

export function worksheetCellText(text: string): string {
  return /^\[\s*\]$/.test(text.trim()) ? '' : text;
}

/** A view of blank exercise tables only; original fields, identities and units stay intact. */
export function presentParticipantWorksheet(table: WorksheetTable): (WorksheetTable & { title: string })[] | null {
  if (!isBlankWorksheetTable(table)) return null;
  const units = table.headers.map((_, column) => {
    if (column === 0) return undefined;
    const values = [...new Set(table.rows.map(row => currencyUnit(row[column])).filter(Boolean))];
    return values.length === 1 ? values[0] : undefined;
  });
  const headers = table.headers.map((header, column) => units[column] && !new RegExp(`\\b${units[column]}\\b`).test(header)
    ? `${header} (${units[column]})` : header);
  const rows = table.rows.map(row => row.map((cell, column) => {
    if (column === 0) return cell;
    const unit = currencyUnit(cell);
    return unit ? units[column] ? '' : `${unit} ______` : worksheetCellText(cell);
  }));
  let groups = [{ title: 'Participant worksheet', columns: headers.map((_, column) => column) }];
  if (headers.length > 5) {
    const firstCurrency = table.headers.findIndex((_, column) => column > 0 && table.rows.some(row => currencyUnit(row[column])));
    if (firstCurrency > 1 && firstCurrency <= 5 && headers.length - firstCurrency <= 4) {
      const budgetFields = table.headers.slice(firstCurrency);
      const budgetTitle = budgetFields.some(header => /\b(status|decision|recommendation)\b/i.test(header)) ? 'Budget and decision' : 'Budget';
      groups = [
        { title: 'Participant worksheet: Comparison', columns: Array.from({ length: firstCurrency }, (_, column) => column) },
        { title: `Participant worksheet: ${budgetTitle}`, columns: [0, ...Array.from({ length: headers.length - firstCurrency }, (_, column) => firstCurrency + column)] },
      ];
    } else {
      groups = [];
      for (let start = 1; start < headers.length; start += 4) groups.push({
        title: `Participant worksheet: Part ${groups.length + 1}`,
        columns: [0, ...Array.from({ length: Math.min(4, headers.length - start) }, (_, column) => start + column)],
      });
    }
  }
  return groups.map(group => ({ title: group.title, headers: group.columns.map(column => headers[column]), rows: rows.map(row => group.columns.map(column => row[column])) }));
}

const escapedBreak = /\\r\\n|\\n|\\r/g;
const structuredEscapedBreak = /(?:\\r\\n|\\n|\\r)(?:(?:\\r\\n|\\n|\\r)|[ \t]*(?:[-*•]|\d+[.)]|\|)[ \t])/;

export function normalizeWorkshopText(text: string): string {
  return (structuredEscapedBreak.test(text) ? text.replace(escapedBreak, '\n') : text).replace(/\r\n?/g, '\n');
}

function tableCells(line: string): string[] | null {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  let code = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '\\' && value[index + 1] === '|') { cell += '|'; index++; }
    else if (character === '`') { code = !code; cell += character; }
    else if (character === '|' && !code) { cells.push(cell.trim()); cell = ''; }
    else cell += character;
  }
  cells.push(cell.trim());
  return cells.length > 1 ? cells : null;
}

/** Recognize complete tables; infer a missing divider only for explicit participant entry rows. */
export function parseWorkshopText(text: string, options: { participantWorksheet?: boolean } = {}): WorkshopTextBlock[] {
  const lines = normalizeWorkshopText(text).split('\n');
  const blocks: WorkshopTextBlock[] = [];
  let prose: string[] = [];
  let fenced = false;
  const flush = () => {
    const value = prose.join('\n').trim();
    if (value) blocks.push({ kind: 'paragraph', text: value });
    prose = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const headers = !fenced ? tableCells(line) : null;
    const divider = headers ? tableCells(lines[index + 1] ?? '') : null;
    const hasDivider = headers && divider && divider.length === headers.length && divider.every(cell => /^:?-{3,}:?$/.test(cell));
    if (!headers || (!hasDivider && !options.participantWorksheet)) {
      prose.push(line);
      continue;
    }
    const rows: string[][] = [];
    let next = index + (hasDivider ? 2 : 1);
    let malformedRow = false;
    for (; next < lines.length; next++) {
      const row = tableCells(lines[next]);
      // Do not drop surplus cell content from a malformed row.
      if (!row) break;
      if (row.length !== headers.length) { malformedRow = true; break; }
      rows.push(row);
    }
    if (!hasDivider) {
      // Multiple consistent entry rows are unambiguous; prose, formulas, citations,
      // checked boxes and partially answered tables must remain literal text.
      const entry = (cell: string) => /^\[\s*\]$/.test(cell) || /^\[(?:Enter|Fill|Write|Record)\b[^\[\]\n]*\]$/i.test(cell);
      const inferred = !malformedRow && rows.length >= 2 && headers.every(cell => cell && !entry(cell))
        && rows.every(row => row[0] && !entry(row[0]) && row.slice(1).every(cell => !cell || entry(cell)))
        && rows.every(row => row.slice(1).some(entry));
      if (!inferred) { prose.push(line); continue; }
    }
    if (!rows.length) { prose.push(line); continue; }
    flush();
    blocks.push({ kind: 'table', headers, rows });
    index = next - 1;
  }
  flush();
  return blocks;
}
