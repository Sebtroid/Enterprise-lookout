type DomSnapshotItem = {
  id: string;
  content?: string | null;
  createdAt?: string;
  description?: string | null;
  result?: string | null;
  resultPreview?: string | null;
  role?: string;
  status?: string;
  updatedAt?: string;
  progressMessage?: string | null;
  progressPercent?: number | null;
  progressStep?: string | null;
  lastProgressAt?: string | null;
  candidateCount?: number;
  pendingCandidateCount?: number;
  fitScore?: number;
  qualityRating?: number;
  userFeedback?: string | null;
  reviewedAt?: string | null;
};

export function shouldReplaceDomCollection<TItem extends DomSnapshotItem>(
  current: TItem[],
  next: TItem[],
) {
  if (current.length !== next.length) return true;

  return current.some((item, index) => {
    const candidate = next[index];
    if (!candidate) return true;

    return (
      item.id !== candidate.id ||
      item.role !== candidate.role ||
      item.content !== candidate.content ||
      item.description !== candidate.description ||
      item.status !== candidate.status ||
      item.result !== candidate.result ||
      item.resultPreview !== candidate.resultPreview ||
      item.progressStep !== candidate.progressStep ||
      item.progressMessage !== candidate.progressMessage ||
      item.progressPercent !== candidate.progressPercent ||
      item.lastProgressAt !== candidate.lastProgressAt ||
      item.candidateCount !== candidate.candidateCount ||
      item.pendingCandidateCount !== candidate.pendingCandidateCount ||
      item.fitScore !== candidate.fitScore ||
      item.qualityRating !== candidate.qualityRating ||
      item.userFeedback !== candidate.userFeedback ||
      item.reviewedAt !== candidate.reviewedAt ||
      item.createdAt !== candidate.createdAt ||
      item.updatedAt !== candidate.updatedAt
    );
  });
}
