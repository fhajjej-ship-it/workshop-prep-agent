export type WorkshopTextBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

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

/** Recognize complete pipe tables only; all other saved wording remains literal text. */
export function parseWorkshopText(text: string): WorkshopTextBlock[] {
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
    if (!headers || !divider || divider.length !== headers.length || !divider.every(cell => /^:?-{3,}:?$/.test(cell))) {
      prose.push(line);
      continue;
    }
    const rows: string[][] = [];
    let next = index + 2;
    for (; next < lines.length; next++) {
      const row = tableCells(lines[next]);
      // Do not drop surplus cell content from a malformed row.
      if (!row || row.length !== headers.length) break;
      rows.push(row);
    }
    if (!rows.length) { prose.push(line); continue; }
    flush();
    blocks.push({ kind: 'table', headers, rows });
    index = next - 1;
  }
  flush();
  return blocks;
}
