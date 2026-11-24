# Owner and host password recovery

## Host team and owner-sent links

Apply `supabase/migrations/0017_host_team_management.sql` after the existing migrations through 0016. Deploy the new function:

```powershell
supabase functions deploy host-team --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

The handler validates the caller's bearer token with Auth and checks the wedding's `owner` membership before granting access or sending email. Its private database helpers are executable only by `service_role`; no service key is added to browser code. Owners and co-owners share the database role `owner`. A Host uses `cohost`; existing planner/photographer roles remain supported. All hosts keep existing wedding administration rights, while team changes and sending someone else's password email require ownership. Duplicate invitations never alter a current member's role.

In **Admin → Hosts & co-owners**, enter a name/email, select Host or Co-owner, and choose **Add host & send password link**. New Auth accounts remain unconfirmed until the recipient verifies the invitation email. Membership is saved before mail is requested. For an existing verified account, the function sends a recovery email instead. **Send password link** retries email delivery or helps an existing team member recover. If SMTP fails after access was added, the UI reports the partial result and keeps that member visible for retry. SMTP acceptance does not guarantee inbox delivery.

Keep the Supabase **Invite user** and **Reset Password** templates pointing at `{{ .ConfirmationURL }}` and allow `https://anandwedsusmita.in/admin/reset-password` (plus actual local preview origins) in Auth's Redirect URLs. Owner-sent emails use Supabase's verified implicit callback, allowing the recipient to open it on their own phone/computer without the sender's PKCE verifier. The app accepts only `invite`/`recovery` callbacks, removes tokens from the address bar, verifies current host membership, and checks it again before password update. Self-requested recovery continues using the existing PKCE flow described below. Expiry and single-use enforcement belong to Supabase Auth. No email link or token is returned to the owner or logged by the function.

Custom SMTP is needed to deliver beyond Supabase's permitted default recipients. Configure **both** functions and deploy the frontend. Run `npm.cmd run test:hosts` for mocked owner checks, mail failures, responsive team management and recipient-device password setup; `test:recovery` retains the existing self-service checks; `test:access` checks owner/team database restrictions. These tests do not send real emails.

The **Forgot password?** link is on `/admin`. It opens `/admin/forgot-password`. Owners and hosts enter their registered email, receive Supabase's recovery email, then open `/admin/reset-password` to choose and confirm a password of at least 12 characters. Open the email link in the same browser and on the same origin used to request it: the app uses [Supabase's PKCE recovery flow](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Enable recovery in the Supabase project

1. In the SQL Editor, apply `supabase/migrations/0012_host_password_recovery.sql` after the existing migrations. It creates a private email lookup accessible only to `service_role`. Do not rerun the seed or earlier migrations.
2. Deploy `supabase/functions/host-password-reset` to the same Supabase project as the app. From an authenticated Supabase CLI, run:

   ```powershell
   supabase functions deploy host-password-reset --project-ref YOUR_PROJECT_REF --no-verify-jwt
   ```

   Alternatively, create an Edge Function named `host-password-reset` in the Supabase dashboard, add both `index.ts` and `handler.ts`, and disable JWT verification for that function. Requests start while the owner is signed out. The server checks eligibility before sending any email; it never returns the membership or email lookup result. The function uses the [built-in server environment variables](https://supabase.com/docs/guides/functions/secrets), including `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`. These keys belong only in the function's environment, never in Vite or browser code.
3. In **Authentication → URL Configuration → Redirect URLs**, add:

   ```text
   https://anandwedsusmita.in/admin/reset-password
   http://127.0.0.1:5173/admin/reset-password
   http://localhost:5173/admin/reset-password
   ```

   Add the actual local port if it differs. Keep the existing Google callback URLs. Supabase validates [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls); without the reset URL it may redirect the email link to the Site URL instead.
4. Keep the **Reset Password** email template's link pointed to `{{ .ConfirmationURL }}`. That URL performs verification before returning the one-time PKCE code to the reset page. The existing Google callback is separate.
5. Confirm that Auth email delivery works for all owner/host addresses. Supabase's default email service only delivers to project team members; use [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) for other recipients. Check function logs for SMTP/rate-limit errors without logging recipients or reset links.
6. Deploy the app changes to make the option available on the public website. Local Vite picks up the UI changes automatically; the local app still needs the remote function and migration to send emails.

## Access and behavior

Eligibility comes from the existing `hosts` table joined to the `anand-susmita` wedding and the registered Auth email. Its supported host roles are `owner`, `cohost`, `planner`, and `photographer`. Guest accounts and hosts belonging only to another wedding do not receive emails from this endpoint. The screen returns the same confirmation for eligible and ineligible addresses. This feature does not create accounts or host memberships.

The SDK retains the PKCE verifier in browser storage. Only a recovery exchange can open the password form; an ordinary sign-in session or Google OAuth code is insufficient. The reset page verifies the authenticated user and current wedding membership, then repeats that membership check before saving. Invalid, expired, consumed, or different-browser links offer a new request. The app removes consumed codes from the address bar. Demo mode explains that any email/password can sign in and does not send recovery emails.

This endpoint restricts the app's recovery emails. Supabase's underlying public Auth API remains governed by the project's Auth configuration; the app does not replace its account-level settings. Database access to host features continues to depend on host membership.

## Verification

`npm.cmd run test:access` checks all migrations, role-restricted email lookup, and eligibility for every supported host role. Run `npm.cmd run test:recovery` against a Vite server on port 5175, or set `WEDDING_TEST_ORIGIN` to the running server. It uses mocked backend traffic and does not send real emails or change live passwords. Screenshots are written under `artifacts/host-recovery-*`.

After setup, request a real recovery email for one owner and one cohost. Open each in the requesting browser, save a password, then verify a fresh host login with it. Verify that a guest email receives no recovery message. Local mocked checks cannot confirm the deployed function, Auth redirect allowlist, or actual email delivery.
