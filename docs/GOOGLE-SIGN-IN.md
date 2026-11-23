# Google sign-in, custom domain, and the Feed

The production address is **https://anandwedsusmita.in**. The invitation and family RSVP stay public. Feed content and post submission require Google sign-in; existing email/password hosts retain access.

## Required settings outside the codebase

These dashboard changes cannot be made by editing the repository. Complete them before deploying this frontend.

1. **Supabase > Authentication > URL Configuration**, project `hfpdujkjdushcqtkhqqs`:
   - Set **Site URL** to `https://anandwedsusmita.in`.
   - Add the exact **Redirect URL** `https://anandwedsusmita.in/auth/callback`.
   - For local tests allow the actual port, for example `http://127.0.0.1:5174/auth/callback` or `http://127.0.0.1:5175/auth/callback`. `localhost` and `127.0.0.1` need separate entries if both are used.
   - Keep URLs needed by other apps sharing this Supabase project. Remove obsolete Wedding Vercel callbacks after in-flight sign-ins finish. Start a fresh sign-in on the custom domain.

   Supabase may fall back to Site URL if the requested callback is not allowed. Application code cannot override a dashboard allowlist error. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

2. **Google Cloud Console > Google Auth Platform / OAuth client**:
   - Keep the authorized redirect URI pointed at Supabase: `https://hfpdujkjdushcqtkhqqs.supabase.co/auth/v1/callback`. The frontend callback is configured in Supabase, not in this field.
   - Add `anandwedsusmita.in` to the consent screen's authorized domains. Update any homepage/privacy links still referencing the old domain. If JavaScript origins are configured for this client, include `https://anandwedsusmita.in`.
   - If the consent app is in Testing, add intended test accounts or publish its consent configuration for wedding guests.
   - Keep the Google client secret in Supabase's Google provider settings. No Google secret belongs in the frontend environment.

   See [Supabase Google OAuth setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

3. **Vercel > Wedding project > Settings > Domains**:
   - Read-only verification on 24 November 2026 confirmed that `https://anandwedsusmita.in` serves directly (HTTP 200) and `https://www.anandwedsusmita.in` redirects to it (HTTP 308). This is the required direction.
   - Attach `anandwedsusmita.in` to production and verify DNS/TLS. Ensure guests can visit without a Vercel account.
   - Redirect the default project domain and `www` to `https://anandwedsusmita.in`. The repository includes host-based redirects for those two known aliases; client bootstrap also canonicalizes non-local origins before loading Auth.
   - Remove any existing redirect from the apex domain to `www`. The apex `anandwedsusmita.in` must serve production directly; `www` and the Vercel alias redirect to it. An apex-to-www dashboard redirect would conflict with the new www-to-apex code redirect and cause a loop.

4. **Vercel > Settings > Environment Variables**:
   - Set `VITE_SITE_URL=https://anandwedsusmita.in` (also the code default).
   - Keep `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`. Never use a service-role/secret key.
   - Rebuild/redeploy after changing frontend environment values; Vite embeds them at build time. The build rejects a different `VITE_SITE_URL` to catch stale domain settings.

5. **Supabase > SQL Editor**:
   - If not yet applied, run `0009_google_guest_access.sql` once, after 0001-0008.
   - Run **`supabase/migrations/0010_photo_posts.sql` once**, after 0009 and before the new uploader is deployed. It adds nullable grouping fields, position validation, an index and an ownership trigger. Existing photos remain individual posts; wishes, families and accounts are unchanged.
   - Do not rerun earlier migrations or the wedding seed against the existing database.

## Return paths and posting

Sign-in saves the exact local pathname, query string, section anchor and scroll position in the current tab. Selected post type and photo quest are in the URL, so the chosen form resumes after authentication. Family identity is relinked. Callback codes are exchanged once under React StrictMode. Cancellation offers retry and a link to the saved destination; external/malformed destinations are rejected.

Canonicalization happens **before** OAuth, because the PKCE verifier and browser state belong to one origin. A sign-in already started on the old Vercel domain cannot transfer that storage to the custom domain. Start a fresh attempt on the custom domain after rollout. Localhost remains local for development.

The Feed combines visible photo posts and approved wishes by creation time, newest first. Pin badges remain, without overriding chronology. Old `/scene`, `/haaku` and `#wishes` links have compatible redirects. Photo quest collections and My photos remain available.

Create Post offers Send a Wish and Upload Photos. Wishes retain host approval. A photo post contains 1-10 images, one caption and moment/quest tags. Images upload first, then publish together in a single database insert. Stable post/image IDs make retries safe after interruption or lost responses. Offline posts remain in IndexedDB, and legacy queued photos still upload individually. New queues and drafts belong to the signed-in account. Photo drafts survive reload/sign-in for 24 hours; wish drafts stay in the same tab until submission. Browser state cannot transfer between unrelated domains.

Carousels support touch swiping, pagination dots, keyboard left/right and desktop previous/next buttons. Reactions, Share, reports and removal requests apply to the currently displayed image. Host moderation remains per photo; hidden images are omitted. The existing latest-photo/latest-50-wishes fetch window is retained, with complete carousels at the photo boundary and Load more posts within that window.

## Verification and owner acceptance

- `npm run build`: TypeScript, production bundle and service worker.
- `npm run test:access`: local PostgreSQL fixtures for migrations, access, Storage, moderation, family RSVP and post constraints.
- `npm run test:browser`: desktop/mobile Chrome using the real Supabase SDK with simulated Auth/Storage. Requires `playwright-core` (or `PLAYWRIGHT_MODULE` pointing to it), Chrome (`CHROME_PATH` if needed), and a running dev server (`WEDDING_TEST_ORIGIN`, default `http://127.0.0.1:5175`). Fixtures never write live data or use a real Google account.

After dashboard setup and deployment, sign in with a real Google account on a desktop browser and a phone. Test `/invitation/feed`, `/invitation/create?type=wish`, `/invitation/create?type=photos&quest=proud-moment` and a family link. Confirm the custom domain remains after callback, the selected form resumes, wishes go to moderation, and a multi-image post appears once in image order. Test offline/retry. Real Google consent and live dashboard settings require this owner acceptance check.
