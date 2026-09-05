import { normalizeWorkshopText } from '@/lib/workshop-text';

type Props = { text: string };

export function formatGeneratedProse(text: string): string {
  return normalizeWorkshopText(text);
}

export default function GeneratedProse({ text }: Props) {
  return <span className="generated-prose">{formatGeneratedProse(text)}</span>;
}
