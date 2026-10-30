# Demo script (about 5 minutes, two browser windows)

Use two browsers or one normal window and one private window. Seed is optional; this script signs up two fresh users.

1. **Sign up two users**  
   Window A: http://localhost:3000/signup — Ada, `ada-demo@example.com`, `Password123`.  
   Window B: same for Beau, `beau-demo@example.com`, `Password123`.

2. **Add books and a shelf**  
   Ada: Books → add "The Hobbit" (READING, total pages 310) and "Dune" (WANT_TO_READ).  
   Shelves → create "Club". Open it and add The Hobbit.

3. **Share as editor**  
   On Club, share `beau-demo@example.com` as EDITOR.  
   Beau: Shared with me → Club appears with role EDITOR.

4. **Viewer is blocked**  
   Ada shares Club with a third account as VIEWER (or demote Beau briefly). As VIEWER, the add/remove controls are hidden. With `api.http` or DevTools, `POST /shelves/:id/books` returns 403 `Viewers cannot add or remove books on this shelf`. Restore Beau as EDITOR if you demoted them.

5. **Editor add is live**  
   Beau adds a book they own to Club. Ada's open Club page updates without refresh (`shelf:book-added`).

6. **Progress auto-finish**  
   Ada opens The Hobbit, status READING, sets current page to 310. Status becomes FINISHED, progress 100%, activity records STATUS_CHANGED.

7. **Lend live**  
   Ada lends Dune to `beau-demo@example.com`. Beau's Borrowed page lists it (`lending:created`). Beau cannot edit it.

8. **Return live**  
   Ada marks Dune returned. It disappears from Beau's borrowed list (`lending:returned`).

9. **Dashboard feed**  
   Ada opens Dashboard: counts by status, lent-out, and the recent activity feed. A new event from Beau still lands live (`activity:new`).
