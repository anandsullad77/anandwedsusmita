# Anand and Susmita — Wedding Invitation

The Wedding project now also includes the Jothe Jotheyali guest and host features for **only Anand and Susmita's wedding**. The original invitation remains at `/`, with companion links below its existing footer. Start at `/invitation` for photos and wishes, `/rsvp` for family recovery, or `/admin` for hosts. There is no marketing page or event picker.

**Live setup:** follow [the Supabase and deployment guide](docs/SUPABASE-SETUP.md). Without Supabase environment variables, the companion uses browser-only demo data (PIN `291126`; any email/password for demo host sign-in).

**Simple web analytics:** **Admin → Analytics** shows unique link visitors, guests signed in with Google, and photo posts/wishes, followed by the 20 most recent posts with guest names, thumbnails and wish text. On mobile it is in **More**. Apply `0013_wedding_analytics.sql` before deployment. Visits are counted once per browser across guest pages, including `/`, without creating anonymous Auth users. Earlier visits cannot be recovered; existing verified guest sign-ins and posts are included. A carousel counts as one photo post. Host accounts are excluded from the sign-in total. Tracking failures never block guests. The demo shows this browser's visits and posts; Google sign-in counts require Supabase. Analytics reads are host-only; no personal invite tokens or URLs are saved.

**Delete a family:** hosts can use **Admin → Families & invites → Delete**, then confirm the named family. This permanently removes its members, RSVP/travel/stay details, linked devices and personal invite link. Shared photos and wishes remain. Existing host-only database policies and cascading foreign keys handle removal; no additional migration is needed. The browser demo follows the same behavior. Run `npm.cmd run test:families` with the local dev server on port 5175 (or set `WEDDING_TEST_ORIGIN`) for desktop/mobile confirmation and demo cleanup checks; `npm.cmd run test:access` verifies database permissions and cascading cleanup.

**Host password recovery:** `/admin` includes **Forgot password?** for owners and hosts. Apply migration `0012_host_password_recovery.sql`, deploy the host recovery Edge Function, and allow the reset URL in Supabase using [the setup instructions](docs/HOST-PASSWORD-RECOVERY.md). Guest accounts do not receive emails from this recovery endpoint. Run `npm.cmd run test:recovery` for mocked recovery checks.

**Feed and Create Post:** photos and approved wishes share `/invitation/feed`, newest first. `/invitation/create` offers Send a Wish or Upload Photos (up to 10 images in one carousel). Google sign-in returns to the selected page, form, quest and section. Existing hosts retain email/password access. Before deployment, apply `0010_photo_posts.sql` after `0009_google_guest_access.sql` and configure the custom domain/callbacks using [the setup guide](docs/GOOGLE-SIGN-IN.md).

An English React wedding invitation for **29 November 2026, 12:28 p.m.**, at Shri Shakambari Mangal Karyalaya, Hosakeri Galli, Sulebhavi, Belagavi. The bride's English spelling, **Susmita**, and family surnames **Sullad** and **Pitagi** are confirmed by the owner.

## Run locally

Requires Node.js 20.19+ or 22.12+.

Double-click `START-WEDDING.cmd` to start the website and open it in your browser, or use the terminal commands below.

```powershell
git clone https://github.com/anandsullad77/anandwedsusmita.git
cd anandwedsusmita
npm.cmd install
npm.cmd run dev
```

Open the Local URL printed by Vite. `npm.cmd` works in PowerShell even when execution of `npm.ps1` is disabled.

```powershell
npm.cmd run build
npm.cmd run preview
```

The production website is generated in `dist/`. Latin font subsets are bundled locally; no Google Fonts connection is required. Cormorant Garamond is used for display text, with Noto Sans for body copy.

## Content and appearance

- `src/main.jsx`: loads the original invitation or wedding companion independently so their styles do not interfere.
- `src/home-entry.jsx`: original countdown, event time, opening, and measured sticky-header height for section links and text resizing.
- `src/WeddingLinks.jsx`: companion links below the original invitation footer.
- `src/companion/`: imported RSVP story, family plans, photos, offline uploads, quests, wishes, Excel imports, Supabase/browser backends, and host admin.
- `src/companion/components/WeddingBrand.tsx`: shared AS logo and textile ornaments for guest, RSVP, upload, family, and host pages. These routes reuse the original SVG files and `src/theme.css`; the original invitation remains unchanged.
- `src/Invitation.jsx`: the English invitation content, navigation, accessible labels, and stationery layout. Traditional honorifics remain transliterated immediately before the couple's names.
- `src/Ornaments.jsx`: vector kolam ornaments, religious and venue illustrations, and icon components.
- `src/InvitationOpening.jsx` and `src/opening.css`: a brief full-screen opening sequence with dark green covers, a pink wax-style AS seal, woven trim, and drifting petals. The two covers unfold directly over the actual website, revealing its existing hero; there is no separate inner card or duplicate hero. It opens automatically on a fresh visit, has no visible skip option, and can be replayed from the footer. Escape can dismiss it for keyboard users. Reduced-motion preferences and direct section links bypass the animation. The animation does not wait for the large illustration to download, and scroll locking preserves the hero's position.
- `src/theme.css`: the supplied palette — `#A53051` pink and `#283A2D` dark green, with `#FFF7EB` and `#F9F0E0` neutral backgrounds.
- `src/stationery.css`: responsive stationery design, woven borders, and reduced-motion support.

The mobile cover fits a typical portrait screen beneath the header, including its full woven border. It uses small viewport height (`svh`) to account for mobile browser controls. Important copy uses readable rem-based sizes: body text is 14–15px at default settings, parents' details are 12–13px, and supporting labels are 12px. On short screens or with enlarged text, sections expand naturally instead of shrinking essential information. The couple profiles stay side by side at normal phone text sizes, and can stack when enlarged text needs more room.

The muhurta date and ceremony time lead the section, with a smaller, lightly outlined countdown below. The weekday, day, month, and year form an aligned date panel between fine rules; the displayed time is simply "12:28 PM", followed by "A beautiful beginning, blessed by your presence." Repeated invitation copy has been shortened to one clear message per section, while the traditional calendar terms are retained. The hero keeps only Lord Ganesha's blessing. The calendar option has been removed. The venue is followed directly by the closing footer; the separate "With Love From" family section and footer date have been removed.

A persistent "Get Directions" header link opens the owner's Google Maps location directly. The hero's "Join the celebration" button opens the companion Invitation page at `/invitation`. The invitation-card menu option, preview popup, and download have been removed from the website.

- `public/images/as-monogram.svg`: the original AS silhouette traced directly from the supplied reference, recoloured dark green without restyling the letters. The header, footer, opening seal, and matching favicon all use this shape.
- `public/images/name-mandala.svg`: a lotus mandala rendered in pink behind the hero names and in ivory on the dark green opening covers. The decoration does not affect text spacing or the first-screen mobile layout.
- `public/images/textile-border.svg`: a repeating vector border inspired by the supplied card's temple peaks, rope lines, and diamond weave. The reference card's wording is not used.
- `docs/original-invitation.jpeg`: the original printed Kannada invitation supplied by the owner, retained as a reference document outside the website's public assets.
- `public/images/anand-susmita-portrait.jpg`: the owner's supplied photograph in the main invitation's couple section. The source photo is preserved; CSS crops it to an arch, adds a soft ivory fade and fine borders, and the existing SVG design language supplies green botanical sprigs with pink flowers. Small screens allow more vertical space for a readable portrait.
- `public/images/anand-susmita-invitation.jpg`: the second supplied photograph, used as the companion Invitation tab's default cover. It has a portrait crop, fine arched borders, a cream fade and matching botanical sprigs shared through `src/PortraitSprig.tsx`. Host-uploaded cover overrides and cover visibility settings remain available. The earlier selfie is retained at `public/images/invitation-couple.webp`.
- `public/images/wedding-couple-pink-green.png`: the retained square couple illustration, recoloured with built-in imagegen to use `#A53051` pink and `#283A2D` dark green. Its supplied original remains at `public/images/wedding-couple-in-bloom.png`; the edit prompt is in `docs/illustration-prompt.md`.
- `public/images/wedding-social-preview.png`: a 1200 × 630 sharing image with the AS monogram, couple's names, wedding date, time and venue. Its editable HTML source is `docs/social-preview.html`, viewable through the Vite server and exportable at 1200 × 630 after fonts have loaded. It uses the existing vector logo and border. The standalone invitation image is retained separately under `share/`.
- `public/images/wedding-illustration-olive-rose.png`: an illustrative couple generated and recoloured with the built-in imagegen tool to match the ivory, cream, olive, and rose palette; it is not a portrait of the actual couple. The original green and previous coral versions are retained as `public/images/wedding-illustration.png` and `public/images/wedding-illustration-coral.png`. Prompts are in `docs/illustration-prompt.md`.

The original invitation's copy is in English, with English digits (0–9). This includes the opening animation, countdown labels and wedding blessing, image descriptions, menu controls, page title, and description. The imported companion also includes Kannada labels and the Banni RSVP story. Family names and traditional calendar terms are transliterated from the owner's Kannada copy. The countdown uses the explicit `+05:30` event time, so it remains correct for guests in other time zones. After the muhurta, it displays a wedding blessing. Venue directions use the owner's supplied location link: https://maps.app.goo.gl/CzVGfb7yyeYVoxam6. Static Open Graph and social-card metadata in `index.html` reference the confirmed public address `https://anandwedsusmita.in/` and the sharing image, so crawlers can read them without JavaScript. These sharing updates become public with the next deployment.

## Owner review

Names and place names follow the typed content supplied by the owner. English family-name spellings are transliterations of that copy. The original card is retained under `docs/` for reference. The draft's spelling-check note is deliberately excluded from the guest-facing page.

## Validation

**Invitation download:** Keep your invitation exports a 1800 × 2700 PNG using the real couple photographs from the main and companion invitation pages, the existing AS monogram, mandala and textile border. The companion cover override is used for the second photograph; cover visibility and extra schedule entries are respected. Long copy expands the card without clipping. Image downloads and Print / Save PDF share the same artwork, and print state clears when the dialog closes. `npm.cmd run test:invitation` checks the saved PNG, both source photos, cover settings, long copy, mobile download, one-page A4 output and repeat printing. Review renders are saved under `artifacts/invitation-download-*`.

**Invitation previews:** after applying `0011_invitation_preview_photos.sql`, hosts can upload up to three photos under **Admin → General invitation → Photos before sign-in** and save them. Signed-out invitation visitors see that selection in the existing collage; signed-in guests see the latest three feed photos. The full feed remains behind Google sign-in. Preview images are compressed to 1200px before upload, saved atomically with the invitation, and retired files are removed after replacements. `npm.cmd run test:previews` checks the admin and guest flows with mocked Supabase data, and `npm.cmd run test:access` checks the database and Storage policies locally.

The feed displays photos and wishes independently as they arrive, loads images only near the viewport and the active carousel slide, and reuses account-scoped private photo URLs until shortly before their five-minute expiry. Photo metadata requests run concurrently, and the invitation preview fetches only three photos. Existing storage access rules and image quality are preserved. Run `npm.cmd run test:feed` against the local dev server on port 5175 (or set `WEDDING_TEST_ORIGIN`) to check delayed-network loading, image request counts, URL reuse and expiry, account isolation, carousel navigation, and preview/boundary behavior with mocked Supabase responses. Results are written to `artifacts/feed-performance-after.json`; these are local simulated-network measurements, not live-site timings.

The production build and local Chrome checks cover English copy and metadata, display fonts, mobile navigation, header and venue directions, hero CTA, the 1200 × 630 sharing image, and countdown states before and after the ceremony. Responsive checks cover thirteen portrait, landscape and desktop sizes from 320 × 480 to 1440 × 1000. Text enlargement is checked at 200% at widths 320, 390, 768 and 1440. Typical portrait sections fit one screen; smaller screens and enlarged text allow vertical scrolling without clipping or horizontal overflow. The opening sequence is checked separately for the real hero reveal, automatic completion, keyboard focus and Escape, replay, and reduced motion. Screenshots are saved in the ignored `artifacts/` directory.

The project runs locally by default. Source is stored in the owner's GitHub repository; hosting is configured separately. Installed dependencies, build output, review artifacts, environment files, and local Sites settings are excluded from Git. Local development and production builds do not require `.openai/hosting.json`.

The combined build runs TypeScript checks before bundling and generates the installable app manifest and offline service worker. `vercel.json` supplies deep-link routing for Vercel; `public/_redirects` supplies it for Netlify. The original `jothe-jotheyali` folder is unchanged. Local browser data is namespaced separately from the source app.

Integration checks verified pixel-identical original invitation views at 390px and 1440px, guest and admin layouts at 320–1440px, photo upload, moderated wishes, family PIN recovery, host sign-in, Excel template/import, and the original opening animation. All eight migrations and the repeatable wedding seed passed local PostgreSQL fixture checks, including family privacy and host-only Storage deletion. Production Chrome checks verified the service worker, direct links, and an offline upload persisting through reload before sending on reconnect. A live Supabase project still needs the setup and acceptance checks in the guide.
