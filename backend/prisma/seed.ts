import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  ActivityType,
  BookStatus,
  PrismaClient,
  ShelfRole,
} from '../src/generated/prisma/client.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required to run the seed script.');
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'Password@123';

type BookSeed = {
  title: string;
  author: string;
  status: BookStatus;
  totalPages: number;
  currentPage?: number;
  rating?: number;
  notes?: string;
  finishedAt?: Date | null;
};

const currentYear = new Date().getFullYear();

const aliceBooks: BookSeed[] = [
  {
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    status: 'FINISHED',
    totalPages: 310,
    currentPage: 310,
    rating: 5,
    notes: 'A comfort reread.',
    finishedAt: new Date(`${currentYear}-02-15T10:00:00Z`),
  },
  {
    title: 'The Fellowship of the Ring',
    author: 'J.R.R. Tolkien',
    status: 'FINISHED',
    totalPages: 423,
    currentPage: 423,
    rating: 5,
    finishedAt: new Date(`${currentYear - 1}-11-20T10:00:00Z`),
  },
  {
    title: 'Dune',
    author: 'Frank Herbert',
    status: 'READING',
    totalPages: 412,
    currentPage: 180,
    rating: 4,
    notes: 'Epic worldbuilding on Arrakis.',
  },
  {
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    status: 'READING',
    totalPages: 496,
    currentPage: 120,
    rating: 5,
  },
  {
    title: '1984',
    author: 'George Orwell',
    status: 'WANT_TO_READ',
    totalPages: 328,
  },
  {
    title: 'Brave New World',
    author: 'Aldous Huxley',
    status: 'WANT_TO_READ',
    totalPages: 268,
    rating: 4,
  },
  {
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    status: 'FINISHED',
    totalPages: 281,
    currentPage: 281,
    rating: 5,
    finishedAt: new Date(`${currentYear}-01-10T12:00:00Z`),
  },
  {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    status: 'WANT_TO_READ',
    totalPages: 279,
    rating: 5,
  },
  {
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    status: 'FINISHED',
    totalPages: 180,
    currentPage: 180,
    rating: 4,
    finishedAt: new Date(`${currentYear - 1}-08-14T09:00:00Z`),
  },
  {
    title: 'Circe',
    author: 'Madeline Miller',
    status: 'WANT_TO_READ',
    totalPages: 393,
    rating: 4,
    notes: 'Lent out to Bob.',
  },
  {
    title: 'Neuromancer',
    author: 'William Gibson',
    status: 'WANT_TO_READ',
    totalPages: 271,
    rating: 3,
  },
];

const bobBooks: BookSeed[] = [
  {
    title: 'The Martian',
    author: 'Andy Weir',
    status: 'FINISHED',
    totalPages: 369,
    currentPage: 369,
    rating: 5,
    finishedAt: new Date(`${currentYear}-03-01T12:00:00Z`),
  },
  {
    title: 'Ancillary Justice',
    author: 'Ann Leckie',
    status: 'READING',
    totalPages: 386,
    currentPage: 95,
    rating: 4,
  },
  {
    title: 'Kindred',
    author: 'Octavia E. Butler',
    status: 'WANT_TO_READ',
    totalPages: 264,
  },
  {
    title: 'Station Eleven',
    author: 'Emily St. John Mandel',
    status: 'READING',
    totalPages: 333,
    currentPage: 50,
    rating: 4,
  },
  {
    title: 'Never Let Me Go',
    author: 'Kazuo Ishiguro',
    status: 'FINISHED',
    totalPages: 288,
    currentPage: 288,
    rating: 4,
    finishedAt: new Date(`${currentYear - 1}-10-15T08:00:00Z`),
  },
];

async function wipeDatabase() {
  await prisma.activityRecipient.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.lending.deleteMany();
  await prisma.shelfBook.deleteMany();
  await prisma.shelfShare.deleteMany();
  await prisma.shelf.deleteMany();
  await prisma.book.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

async function createActivity(input: {
  actorId: string;
  type: ActivityType;
  message: string;
  bookId?: string;
  shelfId?: string;
  targetUserId?: string;
  recipientIds: string[];
}) {
  return prisma.activity.create({
    data: {
      actorId: input.actorId,
      type: input.type,
      message: input.message,
      bookId: input.bookId,
      shelfId: input.shelfId,
      targetUserId: input.targetUserId,
      recipients: {
        create: [...new Set(input.recipientIds)].map((userId) => ({ userId })),
      },
    },
  });
}

async function main() {
  // Wipe database so seed is completely idempotent and safe to re-run
  await wipeDatabase();

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const alice = await prisma.user.create({
    data: {
      name: 'Alice',
      email: 'alice@test.com',
      passwordHash,
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob',
      email: 'bob@test.com',
      passwordHash,
    },
  });

  // Seed Alice's books
  const aliceBookRows = [];
  for (const seed of aliceBooks) {
    const book = await prisma.book.create({
      data: {
        ownerId: alice.id,
        title: seed.title,
        author: seed.author,
        status: seed.status,
        totalPages: seed.totalPages,
        currentPage: seed.currentPage ?? 0,
        rating: seed.rating,
        notes: seed.notes,
        finishedAt: seed.finishedAt ?? null,
      },
    });
    aliceBookRows.push(book);
    await createActivity({
      actorId: alice.id,
      type: 'BOOK_ADDED',
      bookId: book.id,
      message: `Added "${book.title}"`,
      recipientIds: [alice.id],
    });
  }

  // Seed Bob's books
  const bobBookRows = [];
  for (const seed of bobBooks) {
    const book = await prisma.book.create({
      data: {
        ownerId: bob.id,
        title: seed.title,
        author: seed.author,
        status: seed.status,
        totalPages: seed.totalPages,
        currentPage: seed.currentPage ?? 0,
        rating: seed.rating,
        notes: seed.notes,
        finishedAt: seed.finishedAt ?? null,
      },
    });
    bobBookRows.push(book);
    await createActivity({
      actorId: bob.id,
      type: 'BOOK_ADDED',
      bookId: book.id,
      message: `Added "${book.title}"`,
      recipientIds: [bob.id],
    });
  }

  // Shelves for Alice:
  // - "Favorites" shared with Bob as EDITOR
  // - "Classics" shared with Bob as VIEWER
  // - "Private" not shared
  const favorites = await prisma.shelf.create({
    data: { ownerId: alice.id, name: 'Favorites' },
  });
  const classics = await prisma.shelf.create({
    data: { ownerId: alice.id, name: 'Classics' },
  });
  const privateShelf = await prisma.shelf.create({
    data: { ownerId: alice.id, name: 'Private' },
  });

  // Shares for Bob
  await prisma.shelfShare.create({
    data: { shelfId: favorites.id, userId: bob.id, role: ShelfRole.EDITOR },
  });
  await prisma.shelfShare.create({
    data: { shelfId: classics.id, userId: bob.id, role: ShelfRole.VIEWER },
  });

  // Activities for shelf sharing
  await createActivity({
    actorId: alice.id,
    type: 'SHELF_SHARED',
    shelfId: favorites.id,
    targetUserId: bob.id,
    message: `Shared "Favorites" with Bob as EDITOR`,
    recipientIds: [alice.id, bob.id],
  });
  await createActivity({
    actorId: alice.id,
    type: 'SHELF_SHARED',
    shelfId: classics.id,
    targetUserId: bob.id,
    message: `Shared "Classics" with Bob as VIEWER`,
    recipientIds: [alice.id, bob.id],
  });

  // Books on shelves: several books per shelf, and at least one book on two shelves
  const hobbit = aliceBookRows.find((b) => b.title === 'The Hobbit')!;
  const dune = aliceBookRows.find((b) => b.title === 'Dune')!;
  const hailMary = aliceBookRows.find((b) => b.title === 'Project Hail Mary')!;
  const orwell = aliceBookRows.find((b) => b.title === '1984')!;
  const huxley = aliceBookRows.find((b) => b.title === 'Brave New World')!;
  const mockingbird = aliceBookRows.find((b) => b.title === 'To Kill a Mockingbird')!;
  const austen = aliceBookRows.find((b) => b.title === 'Pride and Prejudice')!;
  const neuromancer = aliceBookRows.find((b) => b.title === 'Neuromancer')!;

  // "The Hobbit" is on BOTH Favorites and Classics!
  await prisma.shelfBook.createMany({
    data: [
      { shelfId: favorites.id, bookId: hobbit.id, addedById: alice.id },
      { shelfId: favorites.id, bookId: dune.id, addedById: alice.id },
      { shelfId: favorites.id, bookId: hailMary.id, addedById: alice.id },

      { shelfId: classics.id, bookId: hobbit.id, addedById: alice.id },
      { shelfId: classics.id, bookId: orwell.id, addedById: alice.id },
      { shelfId: classics.id, bookId: mockingbird.id, addedById: alice.id },
      { shelfId: classics.id, bookId: austen.id, addedById: alice.id },

      { shelfId: privateShelf.id, bookId: huxley.id, addedById: alice.id },
      { shelfId: privateShelf.id, bookId: neuromancer.id, addedById: alice.id },
    ],
  });

  // One ACTIVE lending: Alice's book "Circe" lent to Bob
  const circe = aliceBookRows.find((b) => b.title === 'Circe')!;
  await prisma.lending.create({
    data: {
      bookId: circe.id,
      lenderId: alice.id,
      borrowerId: bob.id,
    },
  });

  await createActivity({
    actorId: alice.id,
    type: 'BOOK_LENT',
    bookId: circe.id,
    targetUserId: bob.id,
    message: `Lent "Circe" to Bob`,
    recipientIds: [alice.id, bob.id],
  });

  console.log('Seed complete. Test logins (TEST-ONLY):');
  console.log('  alice@test.com / Password@123 (TEST-ONLY)');
  console.log('  bob@test.com   / Password@123 (TEST-ONLY)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
