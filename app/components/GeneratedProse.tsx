type Props = { text: string };

const escapedBreak = /\\r\\n|\\n|\\r/g;
const structuredEscapedBreak = /(?:\\r\\n|\\n|\\r)(?:(?:\\r\\n|\\n|\\r)|[ \t]*(?:[-*•]|\d+[.)])[ \t])/;

export function formatGeneratedProse(text: string): string {
  return structuredEscapedBreak.test(text) ? text.replace(escapedBreak, '\n') : text;
}

export default function GeneratedProse({ text }: Props) {
  return <span className="generated-prose">{formatGeneratedProse(text)}</span>;
}
