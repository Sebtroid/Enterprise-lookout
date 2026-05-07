type DomSnapshotItem = {
  id: string;
  content?: string;
  createdAt?: string;
  description?: string;
  result?: string | null;
  role?: string;
  status?: string;
  updatedAt?: string;
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
      item.createdAt !== candidate.createdAt ||
      item.updatedAt !== candidate.updatedAt
    );
  });
}
