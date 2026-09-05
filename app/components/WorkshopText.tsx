import type { Material } from '@/lib/types';
import { normalizeWorkshopText, parseWorkshopText } from '@/lib/workshop-text';

type Props = { text: string; materials: Material[]; onRead?: (material: Material) => void };

export function CitedText({ text, materials, onRead }: Props) {
  return <span className="generated-prose">{normalizeWorkshopText(text).split(/(\[[^\]\n]+\])/g).map((part, index) => {
    const material = part.startsWith('[') ? materials.find(item => item.id === part.slice(1, -1)) : undefined;
    if (!material) return part;
    return onRead ? <button type="button" key={index} className="source-tag source-link source-inline" data-source-id={material.id}
      onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }}
      aria-label={`Read source: ${material.title}`}>{material.title}</button>
      : <span key={index} className="source-inline-reference">[{material.title}]</span>;
  })}</span>;
}

export default function WorkshopText({ text, materials, onRead }: Props) {
  return <div className="workshop-prose">{parseWorkshopText(text).map((block, index) => block.kind === 'paragraph'
    ? <p key={index}><CitedText text={block.text} materials={materials} onRead={onRead} /></p>
    : <div key={index} className="workshop-table-scroll" role="region" aria-label="Worksheet table" tabIndex={0}>
      <table className="workshop-text-table"><thead><tr>{block.headers.map((header, cell) => <th key={cell} scope="col"><CitedText text={header} materials={materials} onRead={onRead} /></th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><CitedText text={cell} materials={materials} onRead={onRead} /></td>)}</tr>)}</tbody>
      </table>
    </div>)}</div>;
}
