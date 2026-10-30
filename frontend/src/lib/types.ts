export type BookStatus = 'WANT_TO_READ' | 'READING' | 'FINISHED';
export type ShelfRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export type User = {
  id: string;
  name: string;
  email: string;
};

export type FieldError = {
  field?: string;
  message: string;
};

export type ApiErrorBody = {
  statusCode: number;
  error: string;
  message: string;
  details?: FieldError[] | string[];
};

export type Book = {
  id: string;
  ownerId: string;
  title: string;
  author: string;
  status: BookStatus;
  totalPages: number | null;
  currentPage: number;
  rating: number | null;
  notes: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progressPercentage: number | null;
  access: 'OWNER' | 'BORROWER' | 'SHARED';
  owner?: { id: string; name: string };
  lentTo: {
    id: string;
    name: string;
    email: string;
    lentAt: string;
    lendingId: string;
  } | null;
};

export type BookList = {
  items: Book[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ShelfSummary = {
  id: string;
  name: string;
  createdAt: string;
  bookCount: number;
  collaboratorCount?: number;
  myRole: ShelfRole;
  owner?: { id: string; name: string };
};

export type ShelfDetail = {
  id: string;
  name: string;
  createdAt: string;
  owner: { id: string; name: string };
  myRole: ShelfRole;
  books: Array<
    Book & {
      addedAt: string;
      addedById: string;
      owner: { id: string; name: string };
    }
  >;
  collaborators: Array<{
    id: string;
    name: string;
    email: string;
    role: 'EDITOR' | 'VIEWER';
  }>;
};

export type Activity = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  actor: { id: string; name: string };
};

export type Dashboard = {
  countsByStatus: Record<BookStatus, number>;
  finishedThisYear: number;
  averageRating: number | null;
  topShelf: { id: string; name: string; bookCount: number } | null;
  lentOutCount: number;
  sharedWithMeCount: number;
  recentActivity: Activity[];
};
