/**
 * Review route (§7.1). Thin server component: reads `searchParams` (a Promise in
 * Next 16 — awaited) for `{ repo, pr }` and renders <ReviewShell/>. The repo + PR
 * number are held in client state and sent in the POST /api/generate body; there is
 * no server-addressable run id (nothing is persisted, § Persistence).
 */
import ReviewShell from "@/components/review/ReviewShell";

interface ReviewPageProps {
  searchParams: Promise<{ repo?: string; pr?: string }>;
}

export default async function ReviewPage({
  searchParams,
}: ReviewPageProps): Promise<React.ReactElement> {
  const { repo, pr } = await searchParams;
  const prNumber = pr ? Number(pr) : NaN;

  if (!repo || !Number.isFinite(prNumber)) {
    return (
      <main className="review-missing">
        <h1>Missing review target</h1>
        <p>
          Open this page with a <code>repo</code> and <code>pr</code> query, e.g.{" "}
          <code>/review?repo=owner/name&amp;pr=123</code>.
        </p>
      </main>
    );
  }

  return <ReviewShell repo={repo} prNumber={prNumber} />;
}
