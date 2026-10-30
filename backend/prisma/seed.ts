import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  ActivityType,
  BookStatus,
  PrismaClient,
  ShelfRole,
} from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'Password123';

type BookSeed = {
  title: string;
  author: string;
  status: BookStatus;
  totalPages?: number;
  currentPage?: number;
  rating?: number;
  notes?: string;
};

const aliceBooks: BookSeed[] = [
  { title: 'The Hobbit', author: 'J.R.R. Tolkien', status: 'FINISHED', totalPages: 310, currentPage: 310, rating: 5, notes: 'A comfort reread.' },
  { title: 'The Fellowship of the Ring', author: 'J.R.R. Tolkien', status: 'FINISHED', totalPages: 423, currentPage: 423, rating: 5 },
  { title: 'Dune', author: 'Frank Herbert', status: 'READING', totalPages: 412, currentPage: 180, rating: 4 },
  { title: 'Children of Dune', author: 'Frank Herbert', status: 'WANT_TO_READ', totalPages: 444 },
  { title: 'Neuromancer', author: 'William Gibson', status: 'FINISHED', totalPages: 271, currentPage: 271, rating: 4 },
  { title: 'Snow Crash', author: 'Neal Stephenson', status: 'READING', totalPages: 480, currentPage: 90 },
  { title: 'Foundation', author: 'Isaac Asimov', status: 'WANT_TO_READ' },
  { title: 'Hyperion', author: 'Dan Simmons', status: 'WANT_TO_READ', rating: 5 },
  { title: 'Project Hail Mary', author: 'Andy Weir', status: 'FINISHED', totalPages: 496, currentPage: 496, rating: 5 },
  { title: 'Klara and the Sun', author: 'Kazuo Ishiguro', status: 'READING', totalPages: 307, currentPage: 40, rating: 3 },
  { title: 'Circe', author: 'Madeline Miller', status: 'FINISHED', totalPages: 393, currentPage: 393, rating: 4 },
  { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', status: 'WANT_TO_READ', totalPages: 304 },
];

const bobBooks: BookSeed[] = [
  { title: 'The Martian', author: 'Andy Weir', status: 'FINISHED', totalPages: 369, currentPage: 369, rating: 5 },
  { title: 'Ancillary Justice', author: 'Ann Leckie', status: 'READING', totalPages: 386, currentPage: 120 },
  { title: 'Kindred', author: 'Octavia E. Butler', status: 'WANT_TO_READ' },
  { title: 'The Wind-Up Bird Chronicle', author: 'Haruki Murakami', status: 'WANT_TO_READ', totalPages: 607 },
  { title: 'Never Let Me Go', author: 'Kazuo Ishiguro', status: 'FINISHED', totalPages: 288, currentPage: 288, rating: 4 },
  { title: 'Station Eleven', author: 'Emily St. John Mandel', status: 'READING', totalPages: 333, currentPage: 50, rating: 4 },
];

async function upsertUser(name: string, email: string, passwordHash: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing;
  }
  return prisma.user.create({
    data: { name, email, passwordHash },
  });
}

async function ensureBook(ownerId: string, seed: BookSeed) {
  const existing = await prisma.book.findFirst({
    where: { ownerId, title: seed.title },
  });
  if (existing) {
    return existing;
  }
  const finished = seed.status === 'FINISHED';
  return prisma.book.create({
    data: {
      ownerId,
      title: seed.title,
      author: seed.author,
      status: seed.status,
      totalPages: seed.totalPages,
      currentPage: seed.currentPage ?? (finished ? (seed.totalPages ?? 0) : 0),
      rating: seed.rating,
      notes: seed.notes,
      finishedAt: finished ? new Date() : null,
    },
  });
}

async function ensureShelf(ownerId: string, name: string) {
  const existing = await prisma.shelf.findFirst({ where: { ownerId, name } });
  if (existing) {
    return existing;
  }
  return prisma.shelf.create({ data: { ownerId, name } });
}

async function ensureShare(shelfId: string, userId: string, role: ShelfRole) {
  return prisma.shelfShare.upsert({
    where: { shelfId_userId: { shelfId, userId } },
    update: { role },
    create: { shelfId, userId, role },
  });
}

async function ensureShelfBook(shelfId: string, bookId: string, addedById: string) {
  await prisma.shelfBook.upsert({
    where: { shelfId_bookId: { shelfId, bookId } },
    update: {},
    create: { shelfId, bookId, addedById },
  });
}

async function ensureActivity(input: {
  actorId: string;
  type: ActivityType;
  message: string;
  bookId?: string;
  shelfId?: string;
  targetUserId?: string;
  recipientIds: string[];
}) {
  const existing = await prisma.activity.findFirst({
    where: { actorId: input.actorId, type: input.type, message: input.message },
  });
  if (existing) {
    return existing;
  }
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
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const alice = await upsertUser('Alice', 'alice@example.com', passwordHash);
  const bob = await upsertUser('Bob', 'bob@example.com', passwordHash);
  const carol = await upsertUser('Carol', 'carol@example.com', passwordHash);

  const aliceBookRows = [];
  for (const seed of aliceBooks) {
    const book = await ensureBook(alice.id, seed);
    aliceBookRows.push(book);
    await ensureActivity({
      actorId: alice.id,
      type: 'BOOK_ADDED',
      bookId: book.id,
      message: `Added "${book.title}"`,
      recipientIds: [alice.id],
    });
  }

  const bobBookRows = [];
  for (const seed of bobBooks) {
    const book = await ensureBook(bob.id, seed);
    bobBookRows.push(book);
    await ensureActivity({
      actorId: bob.id,
      type: 'BOOK_ADDED',
      bookId: book.id,
      message: `Added "${book.title}"`,
      recipientIds: [bob.id],
    });
  }

  const favorites = await ensureShelf(alice.id, 'Favorites');
  const sciFi = await ensureShelf(alice.id, 'Sci-Fi');
  const toRead = await ensureShelf(alice.id, 'To Read');
  const bobShelf = await ensureShelf(bob.id, 'Weekend Stack');

  await ensureShare(favorites.id, bob.id, 'EDITOR');
  await ensureShare(sciFi.id, bob.id, 'VIEWER');
  await ensureShare(toRead.id, carol.id, 'VIEWER');

  const hobbit = aliceBookRows.find((b) => b.title === 'The Hobbit')!;
  const dune = aliceBookRows.find((b) => b.title === 'Dune')!;
  const neuromancer = aliceBookRows.find((b) => b.title === 'Neuromancer')!;
  const hailMary = aliceBookRows.find((b) => b.title === 'Project Hail Mary')!;
  const foundation = aliceBookRows.find((b) => b.title === 'Foundation')!;
  const martian = bobBookRows.find((b) => b.title === 'The Martian')!;
  const ancillary = bobBookRows.find((b) => b.title === 'Ancillary Justice')!;

  await ensureShelfBook(favorites.id, hobbit.id, alice.id);
  await ensureShelfBook(favorites.id, hailMary.id, alice.id);
  await ensureShelfBook(favorites.id, martian.id, bob.id);
  await ensureShelfBook(sciFi.id, dune.id, alice.id);
  await ensureShelfBook(sciFi.id, neuromancer.id, alice.id);
  await ensureShelfBook(toRead.id, foundation.id, alice.id);
  await ensureShelfBook(bobShelf.id, ancillary.id, bob.id);

  await ensureActivity({
    actorId: alice.id,
    type: 'SHELF_SHARED',
    shelfId: favorites.id,
    targetUserId: bob.id,
    message: `Shared "Favorites" with Bob as EDITOR`,
    recipientIds: [alice.id, bob.id],
  });
  await ensureActivity({
    actorId: alice.id,
    type: 'SHELF_SHARED',
    shelfId: sciFi.id,
    targetUserId: bob.id,
    message: `Shared "Sci-Fi" with Bob as VIEWER`,
    recipientIds: [alice.id, bob.id],
  });
  await ensureActivity({
    actorId: alice.id,
    type: 'SHELF_SHARED',
    shelfId: toRead.id,
    targetUserId: carol.id,
    message: `Shared "To Read" with Carol as VIEWER`,
    recipientIds: [alice.id, carol.id],
  });

  const lendBook = aliceBookRows.find((b) => b.title === 'Circe')!;
  const active = await prisma.lending.findFirst({
    where: { bookId: lendBook.id, returnedAt: null },
  });
  if (!active) {
    await prisma.lending.create({
      data: {
        bookId: lendBook.id,
        lenderId: alice.id,
        borrowerId: bob.id,
      },
    });
  }
  await ensureActivity({
    actorId: alice.id,
    type: 'BOOK_LENT',
    bookId: lendBook.id,
    targetUserId: bob.id,
    message: `Lent "Circe" to Bob`,
    recipientIds: [alice.id, bob.id],
  });

  console.log('Seed complete. Test logins:');
  console.log('  alice@example.com / Password123');
  console.log('  bob@example.com / Password123');
  console.log('  carol@example.com / Password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
