# Host post approval

New photo uploads and wishes wait privately for approval. In the admin portal, **Review posts** (`/admin/photos`) puts new posts and guest reports in one queue. Owners, co-owners and hosts can make decisions; photographers and planners can view the queue.

## Enable on the connected Supabase project

Apply [0023_post_approval.sql](../supabase/migrations/0023_post_approval.sql) in the Supabase SQL Editor after migrations 0001–0022, then [0024_lock_reviewed_photo_reports.sql](../supabase/migrations/0024_lock_reviewed_photo_reports.sql), before deploying this app version. Apply only missing migrations. Existing photos retain their current visibility. Every subsequent upload, including a host upload, starts pending and hidden. Public browser credentials cannot apply these migrations.

The migration also protects private photo files in Storage, retains report history, and makes upload retries work while a post is still pending. No live database changes are made by running the local tests.

If SQL Editor reports `column "status" of relation "photos" already exists`, use the updated, complete `0023_post_approval.sql` file and run it again, then run the complete `0024_lock_reviewed_photo_reports.sql` file. Both scripts are safe to rerun. Existing approval decisions, report history and reporting locks are preserved; pending or rejected rows left visible by an incomplete setup are made private. Do not drop the status column or recreate the photos table.

## Daily review

1. Open **Review posts → To review**. Each card is a complete photo post or wish. New uploads say **Awaiting approval**. Guest reports include their reasons under **Why this was reported**.
2. Open a photo or **View all photos** to inspect the full images. **Approve & publish** publishes every photo in that post together. **Hide post** keeps it out of the feed.
3. For a reported post already in the feed, choose **Keep in feed** to resolve its reports. For a hidden post, choose **Return to feed** to restore it and resolve its reports. Reported images approved this way permanently lose their guest **Report this photo** and **Request removal** actions, including through the API. Other images in the same post remain reportable. Downloads and reactions remain available. Migration 0024 also applies this lock to images previously restored with resolved reports.
4. Select several cards, or **Select all shown**, then **Approve selected** or **Hide selected**. A bulk action applies in one database transaction. It covers only the selected posts on the current page.
5. Use **In feed**, **Hidden**, or **All posts**, search by guest/caption, or filter by photos, wishes and photo quest. Hidden posts remain available for restoration. The queue includes older posts beyond the guest feed's 200-photo limit.

The queue refreshes every 30 seconds, when returning to its tab, and after decisions. **Refresh posts** reloads immediately. Guests see **Sent for approval** after uploads finish and can view the photos once a host approves them.

## Local checks

```text
npm run test:approval-db
npm run test:access
npm run test:approval
npm run build
```

Browser checks use the isolated fixtures from `test-wedding-browser.cjs` and a local Vite server on port 5175. Database checks use local PostgreSQL fixtures and never connect to production.
