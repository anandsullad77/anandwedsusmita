# Make Anand and Susmita's wedding app live

The original invitation remains at `/`. Its design, text, artwork, countdown, maps link, and opening animation are preserved. A new section below the existing footer opens the wedding companion. There is one wedding (`anand-susmita`), with one seeded ceremony on **29 November 2026 at 12:28 PM IST**. There is no marketing page, event picker, or event creation flow.

## What is included

| Address | Purpose |
| --- | --- |
| `/` | Existing Wedding invitation |
| `/invitation` | Wedding companion: photos, wishes, quests, host updates, and invitation downloads |
| `/invitation/feed` | Photos and approved wishes, newest first |
| `/invitation/create` | Choose Send a Wish or Upload Photos, including an offline queue |
| `/rsvp` | Wedding PIN, find your family, or join as a new family |
| `/i/<family-token>` | Personal family invitation and RSVP story |
| `/app` | Linked family's RSVP, travel, stay, arrival, and shared guest features |
| `/admin` | Host sign-in and administration |

Existing `/e/anand-susmita` and `/g/<general-token>` links still work. Old `/celebrate` links redirect to `/invitation`, preserving subpages, query parameters, and section anchors. Invitations for other wedding slugs are not displayed. The underlying imported database tables retain their event IDs so existing data and migrations remain compatible.

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

## 3. Configure the wedding and host access

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
2. **Families & invites:** add families, or download the Excel sample, replace the sample rows, upload it, review, and create the invitations. Send personal links using the WhatsApp buttons. Imports add families; they do not update existing matching family names.
3. **General invitation:** edit the companion welcome/cover, upload up to three **Photos before sign-in**, and choose which sections to show. Save invitation changes to publish the previews. Signed-in guests continue to see the latest feed photos. These settings affect `/invitation` and the family app; the original `/` invitation stays as designed.
4. **PIN & links:** confirm the family PIN and copy the public companion or family recovery link.
5. **Photos & flags:** moderate photo reports; guests can request review but cannot remove other people's photos.
6. **General invitation → Review wishes & blessings:** approve wishes before they appear to guests.
7. **Gamanisi! updates:** publish actual host updates after confirming the wording.

The companion is linked from the public invitation. Its invitation, cover, venue, host updates and up to three host-selected preview photos are visible before Google sign-in. Visitors still need Google sign-in to view the full guest photo feed, read or submit wishes, or upload images; existing hosts retain their email/password access. Family RSVP, travel, stay, phone numbers, and host administration retain their separate access controls. The `photos`, `invitation-covers` and `invitation-previews` buckets remain private. Preview policies allow invitation visitors to sign only the selected images; hosts alone can upload, replace or remove them. Replaced preview files are cleaned up after a successful save.

## 7. Check before sharing

- Open `/` on a phone and confirm the original invitation and directions.
- In a separate private browser window, open `/invitation` without signing in. Confirm photos and wishes stay hidden, sign in with Google when prompted, then upload a test photo and submit a wish. Confirm the wish stays hidden until approved.
- Create one test family in admin, open its personal link in the private window, and save RSVP/travel/stay. Confirm the host can see the response and that the general visitor cannot see that family's records.
- Try `/rsvp` with the configured PIN. Refresh a deep link to confirm hosting fallback.
- Hide the test photo, approve/reject the test wish, and confirm the guest view updates.

Local SQL fixtures and browser demo tests cannot verify your project's Auth settings, hosted Storage configuration, or live database. Complete these checks against your connected project before sending real invitations.

## Later work carried over from the source app

- **Retention is not scheduled automatically.** `purge_expired()` exists but does nothing unless invoked. It clears phone/travel/stay fields after the configured 30-day date and deletes event rows 30 days after `album_closes_at` (120 days after the seeded wedding), not at day 90. It does not delete uploaded Storage files. Review retention before scheduling it; export anything you want to keep, and implement Storage cleanup separately through the Storage API.
- The source's automatic couple's ZIP export and push notifications are not implemented. Host updates are visible in the app; browser notifications are not sent.
- Confirm Kannada wording and any placeholder Banni story artwork before sharing.

No live Supabase changes or production deployment were made as part of the local integration.
