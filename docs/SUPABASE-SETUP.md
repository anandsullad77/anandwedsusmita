# Make Anand and Susmita's wedding app live

The original invitation remains at `/`. Its design, text, artwork, countdown, maps link, and opening animation are preserved. A new section below the existing footer opens the wedding companion. There is one wedding (`anand-susmita`), with one seeded ceremony on **29 November 2026 at 12:28 PM IST**. There is no marketing page, event picker, or event creation flow.

## What is included

| Address | Purpose |
| --- | --- |
| `/` | Existing Wedding invitation |
| `/invitation` | Wedding companion: photos, wishes, quests, host updates, and invitation downloads |
| `/invitation/feed` | Photos and approved wishes, newest first |
| `/invitation/create` | Choose Send a Wish or Upload Photos, including an offline queue |
| `/invitation/nostalgia` | Public "Before We Said Yes" childhood albums, filters and full photo viewer |
| `/invitation/playground` | Anand vs Susmita, Predict Our Future, Know the Couple and Photo Awards |
| `/invitation/playground/<activity>` | Dedicated activity page; cards open questions directly, with a link back to all activities |
| `/admin/polls` | Host poll editor, schedules, quiz answers, engagement totals and CSV export |
| `/rsvp` | Wedding PIN, find your family, or join as a new family |
| `/i/<family-token>` | Personal family invitation and RSVP story |
| `/app` | Linked family's RSVP, travel, stay, arrival, and shared guest features |
| `/admin` | Host sign-in and administration |
| `/admin/forgot-password` | Owner/host password recovery request |
| `/admin/reset-password` | Set a new password from a recovery email |

Existing `/e/anand-susmita` and `/g/<general-token>` links still work. Old `/celebrate` links redirect to `/invitation`, preserving subpages, query parameters, and section anchors. Invitations for other wedding slugs are not displayed. The underlying imported database tables retain their event IDs so existing data and migrations remain compatible.

“The wedding verdict” shows pinned poll summaries below the Playground activity cards and after the invitation's photos and wishes section. Each preview includes a **Go to Playground** button; guests vote on the separate activity pages. Signed-out visitors see an introduction, while results follow the existing guest sign-in and poll visibility rules. No additional migration is required for these previews.

## 1. Supabase project and authentication

1. Use an existing Supabase project for this wedding, or create one. Choose a region close to your guests if creating a project.
2. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins** for guests. Guests do not enter an email or receive an OTP. Their anonymous account is remembered in their browser. See [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous).
3. Keep **Email** authentication enabled for hosts. The app uses **email and password**, not an email OTP. In **Authentication → Users**, add each host with their real email and a strong password; ensure the user is confirmed. There is no public host sign-up screen. See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).
4. Set the Auth **Site URL** to `https://anandwedsusmita.in`, and save. Under **Redirect URLs**, add `https://anandwedsusmita.in/auth/callback` and `http://127.0.0.1:5174/auth/callback` for Google sign-in. Keep any redirects still needed by the other app. Use the public domain rather than a protected Vercel deployment URL; see [the Google sign-in guide](GOOGLE-SIGN-IN.md).

For custom-domain rollout and the new Feed, follow [the current Google and Feed setup guide](GOOGLE-SIGN-IN.md), including migration 0010.

## 2. Run the SQL migrations

Use the Supabase **SQL Editor** and run each file in `supabase/migrations/` in this exact order:

1. `0001_init.sql` — core tables, family invitations, PIN, RSVP, travel/stay, photos, host permissions, private photos bucket.
2. `0002_host_review_photo_flags.sql` — reports require host moderation.
3. `0003_general_invitations.sql` — general visitors without family access.
4. `0004_import_households.sql` — validated Excel family imports.
5. `0005_general_invitation_extras.sql` — settings, cover bucket, moderated wishes.
6. `0006_photo_quests.sql` — photo quests and progress.
7. `0007_shared_invitation.sql` — shared features for linked family guests.
8. `0008_single_wedding.sql` — `/invitation` opens only this wedding; PIN crypto functions support Supabase's extensions schema; hosts can remove photo files from private Storage.
9. `0009_google_guest_access.sql` — Google sign-in is required for this wedding's photos, uploads and wishes, with host access preserved.
10. `0010_photo_posts.sql` — adds grouping and positions for multi-image posts while retaining legacy photos.
11. `0011_invitation_preview_photos.sql` — three host-managed photos in the invitation before Google sign-in, with a separate private previews bucket and host-only uploads.

**Run only missing migrations, in order, through 0011.** A project already on 0010 needs only 0011. These migrations are not a database reset script; rerunning `0001` against existing tables will fail. Follow [the Google sign-in guide](GOOGLE-SIGN-IN.md) to configure the custom domain and application callback before publishing. The original Jothe Jotheyali source folder has not been changed.

For owner and host password recovery, apply `0012_host_password_recovery.sql` next and complete [the recovery function and email setup](HOST-PASSWORD-RECOVERY.md). The SQL migration alone does not enable recovery emails.

For the **Admin → Analytics** tab, apply `0013_wedding_analytics.sql` after 0012, before deploying the updated app. It adds unique browser visits, verified Google guest sign-ins, and a host-only summary of all photo posts and wishes. Existing sign-ins and posts are included; visit counts start when tracking is enabled. No extra credentials or third-party analytics account are needed. Run `npm.cmd run test:access` for database checks and `npm.cmd run test:analytics` with the local dev server on port 5175 for browser checks.

For **Guest contacts & memories**, run the next missing migrations in order: `0014_streamlined_rsvp.sql`, then **`0015_guest_memory_directory.sql`**. A project already through 0014 needs only 0015. The latter adds the latest recorded wedding sign-in timestamp and host-only, paginated guest/contact/post queries. It derives names/emails from verified Google identities already stored in Auth and ties posts to their original account IDs. Anonymous guests, other guests and hosts of another wedding cannot read this list or its internal views. There is no new browser secret or Gmail scope. Deploy the frontend after the migration. The sign-in screen includes the wedding-memory email notice; no email-sending service is configured or used.

For **Review posts**, apply **`0023_post_approval.sql` after 0022 and before deploying the frontend**. Every new photo post and wish stays private until an owner, co-owner or host approves it. Existing photos retain their current visibility. The queue includes new posts, guest reports, bulk decisions and a **Return to feed** action for hidden posts. See [post approval setup](POST-APPROVAL.md) for the daily workflow and local checks.

Apply **`0024_lock_reviewed_photo_reports.sql` after 0023** to disable further guest reports and removal requests on reported images that hosts approve or return to the feed. The lock is enforced in the database and also covers previously restored images with resolved reports. Unreported images, downloads and reactions retain their usual behavior.

In **Analytics → Guest contacts & memories**, export the complete guest list and posts/wishes separately as CSV, or open one guest's memories to export that guest's content. Exported photo Storage paths are durable references for hosts, not public links or embedded photo files. Open the corresponding private photos from the guest's memory view to save the images. Account deletion and missing historical ownership prevent recovery or reliable email matching; display names alone are never used to assign a post. First/latest recorded dates do not represent a complete historical visit log. `npm.cmd run test:memories` checks desktop/mobile views, complete paginated exports, same-name accounts, retries, private previews, UTF-8 text and spreadsheet safety.

## 3. Configure the wedding and host access

The guest menu is ordered **Invitation, Nostalgia, Create Post, Feed, Playground**. Nostalgia displays the 13 supplied childhood photographs as Anand and Susmita albums, with filters and a keyboard/touch photo viewer. Guests can browse without Google sign-in; linked families see the same albums at `/app/nostalgia`. Display JPEGs ship in `public/images/nostalgia/`; originals remain in `Nostalgia/`. There is no visitor or host upload/editing workflow and no database table, migration or Storage bucket to configure. The existing Nostalgia visibility setting still applies. Run `npm.cmd run test:nostalgia` for responsive photo, filtering and viewer checks. The Invitation page retains its original content; Playground is a separate route.

For **The Wedding Playground**, apply **`0019_wedding_playground.sql` after 0018**, then deploy the frontend. The app offers four activities: **Anand vs Susmita, Predict Our Future, Know the Couple and Photo Awards**, in that order. Existing verified Google/host identity and invitation access are reused. Polls refresh every 20 seconds while the tab is visible; no new Edge Function, environment variable or Realtime publication is needed. Starter polls are seeded for an existing wedding; fresh installs seed them when `seed_anand_susmita.sql` runs. Reruns preserve existing questions.

Open **Admin > Wedding Playground** (`/admin/polls`; on mobile, under **More**). Confirm the three provisional quiz answer keys before opening them, and nominate visible feed photos for Photo Awards. Hosts can create questions in the four retained categories, including single/multiple choice and rating predictions; schedule opens, closes and reveals in IST; choose result visibility; feature polls in The Wedding Verdict; duplicate questions; and export aggregate results. With migration `0025_edit_playground_questions.sql`, questions and options remain editable after guests vote: **Save new voting round** archives the old question and its answers, then publishes the replacement with the selected status and schedule. Status, scheduling and display changes retain existing ballots. The migration is safe to rerun and must be applied before a future deployment of the updated editor. Quiz ballots get one attempt; other open polls allow replacing a choice. Reveals require closed voting and the reveal time to have arrived. Predictions close one day after the ceremony and remain saved for the anniversary.

Live Polls, Team Battle, Secret Answers and Words of Love have been removed from guest pages, host tools and result previews. Their old activity URLs return to the Playground overview. Existing database records are preserved; installations already on 0019 need only the updated frontend. General invitation settings can hide the Nostalgia or Playground menu entries. Run `npm.cmd run test:celebration-db` and `npm.cmd run test:celebration` (browser checks use `WEDDING_TEST_ORIGIN`, default port 5175). These checks use local fixtures and send no real votes to Supabase.

For the 12 personalized **Anand vs Susmita** questions, apply `0020_personalized_duel_questions.sql` after 0019. This replaces the question set in the supplied order and keeps Anand/Susmita as the answer choices. Replaced questions are archived and removed from both guest and host question lists, with their existing ballots preserved. Archived ballots are excluded from active Playground totals. The update is repeatable, updates future seeds, and leaves the other activities unchanged. A frontend deployment alone does not update the live question records.

For the nine confirmed **Know the Couple** questions, apply `0021_personalized_quiz_questions.sql` after 0020. It adds the supplied questions, four options each, and the confirmed answer keys in the requested order. Old quiz questions disappear from both guest and host lists while their ballots and keys are retained. Correct answers remain private until voting closes and the reveal time arrives. The update is repeatable and also updates future seeds. Local demo answer keys are available only during development and are removed from production JavaScript.

For the nine personalized **Predict Our Future** questions, apply `0022_personalized_prediction_questions.sql` after 0021. It replaces the prediction set with the supplied questions and four options each, in order. Old predictions and any remaining old Know the Couple questions are removed from both guest and host lists; their ballots are retained. Existing matching questions keep their IDs and schedules. New predictions use the existing closing date one day after the ceremony and first-anniversary reveal date. Fresh installs also receive the new sets. Apply the pending migrations in order; changing or deploying frontend files alone does not update a connected Supabase question list.

For **Individual / Family** links, apply `0018_individual_invitations.sql` after 0017 before deploying the app. Existing links remain Family. New contact imports default to Individual with one place; the editor/import review lets hosts switch the type. The database rejects extra members on individual links and refuses to convert a link that already has multiple members. Family RSVP still permits additions within the host's configured maximum. No existing guests, replies or invite tokens are removed.

For **Hosts & co-owners**, apply `0017_host_team_management.sql` after 0016 and deploy the `host-team` Edge Function. Keep `host-password-reset` deployed for self-service requests. Configure SMTP and the reset redirect before deploying the frontend; [host recovery setup](HOST-PASSWORD-RECOVERY.md) covers both flows. Existing owners can then add hosts/co-owners and send password setup/reset emails directly in `/admin/hosts`. No seed rerun is needed.

For the feed's **four photo reactions**, apply **`0016_photo_reactions.sql`** after 0015, then deploy the frontend. Existing `akshate` rows become Blessings reactions; no existing reactions are removed. The same account/photo primary key permits only one of `akshate`, `love`, `wow` or `celebrate` per image. A checked invoker-rights RPC replaces or removes that choice under the existing photo, invitation and Google-access policies. Another RPC returns reaction totals and the caller's own choice without listing other account IDs, avoiding REST row-limit truncation on popular photos. The private host memory directory continues to count all current reactions. No additional credentials, external services or image assets are needed. `npm.cmd run test:access` tests database permissions and counts; `npm.cmd run test:reactions` tests mobile/desktop controls, animation, reduced motion, persistence, errors and per-slide isolation; `npm.cmd run test:feed` verifies lazy image loading and cached URLs.

Open `supabase/seed_anand_susmita.sql`. Edit the three values at the top:

```sql
host_emails text[] := array['your-real-email@example.com'];
wedding_pin text := 'YOUR_SIX_DIGIT_PIN';
host_whatsapp text := '91YOUR_NUMBER';
```

Use the real email(s) of the confirmed Auth users you created, any six digits for the family PIN, and your WhatsApp number with country code and digits only (no `+` or spaces). For multiple hosts, put multiple quoted emails in the array.

Then run the whole edited seed file in the SQL Editor. It checks the values before writing, creates/updates only Anand and Susmita's wedding, adds one ceremony to a new wedding, stores the PIN securely for guest checks, links the hosts, and creates the general invitation. It does not import fictional demo families.

The seed can be rerun: it updates the wedding details and PIN but preserves families, replies, wishes, photos, general tokens, and existing host memberships. On an already configured wedding, rerun it only if you intend to update these settings. To preserve the existing settings and only add the new direct entry, run migration 0008 without rerunning the seed.

You do not need to copy a general invitation token into an environment variable. The database resolves this wedding's token when `/invitation` opens.

## 4. Connect the app

Copy `.env.example` to `.env.local` and fill:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Find these in the project's **Connect** dialog or **Settings → API Keys**. Use the public **publishable** key; a legacy public `anon` key also works via `VITE_SUPABASE_ANON_KEY`. Never use a secret or `service_role` key in this browser app. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Restart the dev server after changing environment files. With both URL and key empty, the app uses browser-only demo storage, wedding PIN **291126**, and any email/password for demo host sign-in. The sample guests and transport announcement are demonstration data only. Switching to Supabase does not transfer browser demo data or photos.

## 5. Deploy the Wedding project

For the existing Vercel project serving `anandwedsusmita.in`:

1. Deploy **this Wedding project**, with its `package.json`, `vercel.json`, `src`, `public`, and `supabase` files. If the repository root is the Wedding project itself, leave Vercel's Root Directory at the repository root. If it is a parent repository, set it to `Wedding`.
2. Choose the **Vite** framework, build command `npm run build`, output directory `dist`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to Vercel's environment variables for Production (and Preview if you will use it).
4. Trigger a new deployment after setting the variables. Vite embeds them at build time.
5. Keep `vercel.json`: it supplies the SPA fallback needed when opening `/admin`, family links, or album pages directly. See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).

For Netlify, the included `public/_redirects` provides the SPA fallback. Other static hosts need equivalent fallback to `index.html`. Use HTTPS for installation and browser photo/offline features. No separate Node backend, WhatsApp API, or SMS service is required. WhatsApp buttons open a prepared message for you to send.

## 6. Finish in the host admin

1. Open `/admin` and sign in with your confirmed host email/password.
2. **Families & invites:** add families, use **Import contacts** to select phone contacts or upload a `.vcf` contact file, or use the Excel sample to upload several families. Review names and numbers before importing. Contact imports skip duplicate family names and phone numbers and use the same `0004_import_households.sql` migration as Excel. Send personal links using the WhatsApp buttons. Imports add families; they do not update existing matching family names or send messages automatically.
3. **General invitation:** edit the companion welcome/cover, upload up to three **Photos before sign-in**, and choose which sections to show. Save invitation changes to publish the previews. Signed-in guests continue to see the latest feed photos. These settings affect `/invitation` and the family app; the original `/` invitation stays as designed.
4. **PIN & links:** confirm the family PIN and copy the public companion or family recovery link.
5. **Review posts:** approve new photos and wishes, resolve reports, or return hidden posts to the feed. Apply migration `0023_post_approval.sql` before deploying this version. See [post approval setup and daily review](POST-APPROVAL.md).
6. **General invitation → Review wishes & blessings:** approve wishes before they appear to guests.
7. **Gamanisi! updates:** publish actual host updates after confirming the wording.
8. **Analytics → Guest contacts & memories:** review Google names/emails and guest activity, then export contacts and posts/wishes to keep for sending wedding memories later.

The companion is linked from the public invitation. Its invitation, cover, venue, host updates and up to three host-selected preview photos are visible before Google sign-in. Visitors still need Google sign-in to view the full guest photo feed, read or submit wishes, or upload images; existing hosts retain their email/password access. Family RSVP, travel, stay, phone numbers, and host administration retain their separate access controls. The `photos`, `invitation-covers` and `invitation-previews` buckets remain private. Preview policies allow invitation visitors to sign only the selected images; hosts alone can upload, replace or remove them. Replaced preview files are cleaned up after a successful save.

## 7. Check before sharing

- Open `/` on a phone and confirm the original invitation and directions.
- In a separate private browser window, open `/invitation` without signing in. Confirm photos and wishes stay hidden, sign in with Google when prompted, then upload a test photo and submit a wish. Confirm both stay out of the feed until a host approves them in **Review posts**.
- Create one test family in admin, open its personal link in the private window, and save RSVP/travel/stay. Confirm the host can see the response and that the general visitor cannot see that family's records.
- Try `/rsvp` with the configured PIN. Refresh a deep link to confirm hosting fallback.
- Hide the test photo, approve/reject the test wish, and confirm the guest view updates.

Local SQL fixtures and browser demo tests cannot verify your project's Auth settings, hosted Storage configuration, or live database. Complete these checks against your connected project before sending real invitations.

## Later work carried over from the source app

- **Retention is not scheduled automatically.** `purge_expired()` exists but does nothing unless invoked. It clears phone/travel/stay fields after the configured 30-day date and deletes event rows 30 days after `album_closes_at` (120 days after the seeded wedding), not at day 90. It does not delete uploaded Storage files. Review retention before scheduling it; export anything you want to keep, and implement Storage cleanup separately through the Storage API.
- The source's automatic couple's ZIP export and push notifications are not implemented. Host updates are visible in the app; browser notifications are not sent.
- Confirm Kannada wording and any placeholder Banni story artwork before sharing.

No live Supabase changes or production deployment were made as part of the local integration.

For the streamlined family RSVP, apply `0014_streamlined_rsvp.sql` after 0013 before deploying the updated app. The migration makes retries safe and allows uncertain travel and stay details to be cleared.
