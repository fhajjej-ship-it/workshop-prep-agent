import type { PublicRun } from '@/lib/types';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import AnimatedDetails from './AnimatedDetails';

const areaNames: Record<string, string> = {
  goal: 'Workshop goal', audience: 'Audience', constraints: 'Constraints', grounding: 'Source claims', completeness: 'Exercise completeness',
};

export default function ContentReview({ run }: { run: PublicRun }) {
  const review = run.contentReview;
  if (!review) return run.workflowVersion === 2 ? <div className="content-review-note"><strong>Content review pending</strong><p>Timing and reference checks are separate from reviewing the workshop’s suitability.</p></div> : <div className="content-review-note"><strong>Earlier preparation</strong><p>This saved pack has timing and reference checks only. No separate content review was recorded.</p></div>;
  const current = review.reviewedRevision === run.revision;
  const passed = current && review.status === 'passed';
  const heading = review.mode === 'scripted' ? 'Scripted content review' : 'AI-assisted content review';
  return <section className={`content-review ${passed ? 'review-passed' : 'review-attention'}`} aria-label={heading}>
    <div className="content-review-heading">{passed ? <CircleCheck size={17} aria-hidden="true" /> : <TriangleAlert size={17} aria-hidden="true" />}<div><h3>{heading}</h3><p>{!current ? `Review of draft ${review.reviewedRevision} · Current draft ${run.revision} awaits review` : passed ? `Draft ${review.reviewedRevision} · No issues flagged by this review` : `Draft ${review.reviewedRevision} · Changes needed`}</p></div></div>
    <p className="content-review-boundary">{review.mode === 'scripted' ? 'This test review uses fixed responses; no AI quality judgment was made.' : 'Model-assisted feedback. Verify facts, audience fit and facilitation choices before using the workshop.'}</p>
    {review.issues.length > 0 && <ul className="content-review-issues">{review.issues.map((issue, index) => <li key={`${issue.area}-${index}`}><strong>{areaNames[issue.area] ?? issue.area}</strong><span>{issue.message}</span></li>)}</ul>}
    <AnimatedDetails className="content-review-checks" summary={<><span>Review details · {review.mode === 'scripted' ? 'scripted' : 'AI-assisted'}</span><span aria-hidden="true">+</span></>}><ul>{Object.entries(review.checks).map(([area, check]) => <li key={area}><strong>{areaNames[area] ?? area} · {check.passed ? 'No issue flagged' : 'Needs attention'}</strong><p>{check.reason}</p></li>)}</ul></AnimatedDetails>
  </section>;
}
