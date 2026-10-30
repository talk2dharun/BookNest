type ActiveLending = {
  id: string;
  lentAt: Date;
  borrower: { id: string; name: string; email: string };
};

export function progressPercentage(
  currentPage: number,
  totalPages: number | null | undefined,
): number | null {
  if (totalPages == null || totalPages <= 0) {
    return null;
  }
  return Math.round((currentPage / totalPages) * 100);
}

export function toBookResponse<
  T extends {
    currentPage: number;
    totalPages: number | null;
    ownerId: string;
    lendings?: ActiveLending[];
    owner?: { id: string; name: string };
  },
>(book: T, viewerId: string) {
  const { lendings = [], ...rest } = book;
  const active = lendings[0];
  return {
    ...rest,
    progressPercentage: progressPercentage(book.currentPage, book.totalPages),
    lentTo: active
      ? {
          id: active.borrower.id,
          name: active.borrower.name,
          email: active.borrower.email,
          lentAt: active.lentAt,
          lendingId: active.id,
        }
      : null,
    access:
      book.ownerId === viewerId
        ? 'OWNER'
        : active?.borrower.id === viewerId
          ? 'BORROWER'
          : 'SHARED',
  };
}
