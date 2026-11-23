# Google sign-in for wedding photos and wishes

The invitation at `/` and `/invitation` stays public. Guests sign in with Google when opening Photos, Upload, or Wishes. Gallery previews, approved wishes, personal photo counts, and photo URLs are not fetched before sign-in. After Google returns, the app resumes the selected page, photo quest or wishes anchor. Existing email/password hosts retain their access. Family invitations and RSVP still work without Google.

## Finish setup in the existing Supabase project

Google is already enabled in project `hfpdujkjdushcqtkhqqs` (checked through the public Auth settings). No extra Google client ID or client secret belongs in the Wedding frontend or its environment files.

1. Open **Supabase → Authentication → URL Configuration** for that project. Keep the existing redirects needed by Jothe Jotheyali and add both of these under **Redirect URLs**:

   ```text
   https://anandwedsusmita.vercel.app/auth/callback
   http://127.0.0.1:5174/auth/callback
   ```

   Add any other actual preview/custom domain as its own callback URL if you intend to test sign-in there. The app uses the current website origin for the return address. Supabase must allow it. See [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

2. Open **SQL Editor → New query**, paste the entire `supabase/migrations/0009_google_guest_access.sql` file, and run it **once**, after migrations 0001–0008. It adds access rules and wrappers; it does not delete existing photos, wishes, families or accounts. Do not rerun the earlier schema or the wedding seed.

3. Test locally at `http://127.0.0.1:5174/invitation`. In a fresh/private browser, the invitation and venue should open immediately. Photos and Upload should show **Continue with Google**. Wishes should show the same prompt, with no messages exposed. Complete Google sign-in and confirm that you return to the selected page.

4. Once the callback URLs and migration are in place, publish the updated code to GitHub/Vercel. The existing Supabase URL and public publishable key stay the same. Test the production sign-in once after deployment, including a direct link to `/invitation/scene`.

If Google itself reports a client configuration error, inspect the existing OAuth app in Google Cloud. Its authorized redirect URI must be the **Supabase** callback:

```text
https://hfpdujkjdushcqtkhqqs.supabase.co/auth/v1/callback
```

That is different from the two application callback URLs above. Keep client secrets in Supabase's Google provider settings. If the Google consent app is in Testing, add the intended test accounts or publish the consent configuration for your guests as appropriate.

## What the change protects

- This wedding's photos, Storage photo access, uploads, wishes, interactions and photo quest summaries require a verified Google identity or an existing wedding host. Anonymous Supabase sessions and ordinary non-host email accounts are insufficient.
- The new restrictive database policies are combined with the existing invitation, family and moderation policies. Google sign-in alone does not grant access to an unrelated wedding or reveal hidden photos or unapproved wishes.
- The general invitation is public, so any Google account that opens it can become a visitor and access this wedding's visible photos and approved wishes. This change identifies signed-in guests; it does not add a preapproved email list.
- The SQL helper reads the server's `auth.identities`, rather than trusting a provider name entered in a guest profile. Old RPC implementations are no longer directly callable by clients.
- This applies to the same wedding's data even when it is requested through the old Jothe Jotheyali client. That older client has no new Google prompt, so use the updated Wedding pages for photos and wishes. Other wedding events in the shared database retain their existing rules.
- Guests return through a PKCE callback. The return path is limited to local guest routes, preventing an external redirect. A remembered family device is relinked after sign-in so RSVP and family identity continue to work.
- New queued uploads are bound to the signed-in account. A different account cannot automatically send another account's queued images. Existing legacy queued items still require Google sign-in before uploading.
- Sign-out unloads private page content. New signed photo URLs expire after five minutes. Previously issued URLs remain valid until their original expiry (up to one hour for URLs issued by the old client); changing database policies does not invalidate an already issued signed URL.

The Google icon is the official [Google Identity mark](https://developers.google.com/static/identity/images/g-logo.png), used locally without recolouring. It is not generated artwork.

## Validation

Run `npm run test:access` for local PostgreSQL fixtures covering anonymous visitors, verified Google guests, non-host email accounts, hosts, family RSVP, direct RPC bypass attempts, Storage restrictions, and other wedding events. Run `npm run build` for the application checks.

Browser checks exercise the real Supabase JS client against simulated OAuth responses: public pages make no private requests, Google returns to the original destination, one-time codes are exchanged once, wishes/uploads work after sign-in, cancellation recovers, sign-out removes private content, family identity is relinked, and external return URLs are rejected. Completing sign-in with a real Google account remains an owner acceptance check.
