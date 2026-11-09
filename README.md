# Anand and Susmita — Wedding Invitation

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

- `src/main.jsx`: countdown, event time, invitation dialog behavior, and measured sticky-header height for section links and text resizing.
- `src/Invitation.jsx`: the English invitation content, navigation, accessible labels, and stationery layout. Traditional honorifics remain transliterated immediately before the couple's names.
- `src/Ornaments.jsx`: vector kolam ornaments, religious and venue illustrations, and icon components.
- `src/InvitationOpening.jsx` and `src/opening.css`: a brief full-screen opening sequence with dark green covers, a pink wax-style AS seal, woven trim, and drifting petals. The two covers unfold directly over the actual website, revealing its existing hero; there is no separate inner card or duplicate hero. It opens automatically on a fresh visit, can be skipped with the button or Escape, and can be replayed from the footer. Reduced-motion preferences and direct section links bypass the animation. The animation does not wait for the large illustration to download, and scroll locking preserves the hero's position.
- `src/theme.css`: the supplied palette — `#A53051` pink and `#283A2D` dark green, with `#FFF7EB` and `#F9F0E0` neutral backgrounds.
- `src/stationery.css`: responsive stationery design, woven borders, and reduced-motion support.

The mobile cover fits a typical portrait screen beneath the header, including its full woven border. It uses small viewport height (`svh`) to account for mobile browser controls. Important copy uses readable rem-based sizes: body text is 14–15px at default settings, parents' details are 12–13px, and supporting labels are 12px. On short screens or with enlarged text, sections expand naturally instead of shrinking essential information. The couple profiles stay side by side at normal phone text sizes, and can stack when enlarged text needs more room.

The muhurta date and ceremony time lead the section, with a smaller, lightly outlined countdown below. The weekday, day, month, and year form an aligned date panel between fine rules; the displayed time is simply "12:28 PM", followed by "A beautiful beginning, blessed by your presence." Repeated invitation copy has been shortened to one clear message per section, while the traditional calendar terms are retained. The hero keeps only Lord Ganesha's blessing. The calendar option has been removed. The venue is followed directly by the closing footer; the separate "With Love From" family section and footer date have been removed.

A persistent "Get Directions" header link opens the owner's Google Maps location directly. The hero's "View Wedding Details" button links to the muhurta section. The original invitation-card preview and download still use the original Kannada scan.

- `public/images/as-monogram.svg`: the original AS silhouette traced directly from the supplied reference, recoloured dark green without restyling the letters. The header, footer, opening seal, and matching favicon all use this shape.
- `public/images/name-mandala.svg`: a lotus mandala rendered in pink behind the hero names and in ivory on the dark green opening covers. The decoration does not affect text spacing or the first-screen mobile layout.
- `public/images/textile-border.svg`: a repeating vector border inspired by the supplied card's temple peaks, rope lines, and diamond weave. The reference card's wording is not used.
- `public/images/original-invitation.jpeg`: the original printed Kannada invitation supplied by the owner, preserved as a source document. Its preview is labelled "Original Invitation · Kannada"; the surrounding controls and download filename are in English.
- `public/images/wedding-couple-pink-green.png`: the active square couple illustration, recoloured from the owner's image with built-in imagegen to use `#A53051` pink and `#283A2D` dark green. It is displayed at its complete square aspect ratio without cropping, with a soft CSS edge and darken blending to integrate the paper background. Its rectangular frame and repeated caption have been removed. The repeated village lines are removed from both profiles. The supplied original is retained as `public/images/wedding-couple-in-bloom.png`; the edit prompt is in `docs/illustration-prompt.md`.
- `public/images/wedding-social-preview.png`: a 1200 × 630 sharing image with the AS monogram, couple's names, wedding date, time and venue. Its editable HTML source is `docs/social-preview.html`, viewable through the Vite server and exportable at 1200 × 630 after fonts have loaded. It uses the existing vector logo and border; the invitation-card download is separate.
- `public/images/wedding-illustration-olive-rose.png`: an illustrative couple generated and recoloured with the built-in imagegen tool to match the ivory, cream, olive, and rose palette; it is not a portrait of the actual couple. The original green and previous coral versions are retained as `public/images/wedding-illustration.png` and `public/images/wedding-illustration-coral.png`. Prompts are in `docs/illustration-prompt.md`.

All website copy is in English, with English digits (0–9). This includes the opening animation, countdown labels and wedding blessing, image descriptions, menu controls, page title, and description. Family names and traditional calendar terms are transliterated from the owner's Kannada copy. The countdown uses the explicit `+05:30` event time, so it remains correct for guests in other time zones. After the muhurta, it displays a wedding blessing. Venue directions use the owner's supplied location link: https://maps.app.goo.gl/CzVGfb7yyeYVoxam6. Static Open Graph and social-card metadata in `index.html` reference the confirmed public address `https://anandwedsusmita.vercel.app/` and the sharing image, so crawlers can read them without JavaScript. These sharing updates become public with the next deployment.

## Owner review

Names and place names follow the typed content supplied by the owner. English family-name spellings are transliterations of that copy. The original card remains available in the invitation preview for reference. The draft's spelling-check note is deliberately excluded from the guest-facing page.

## Validation

The production build and local Chrome checks cover English copy and metadata, display fonts, mobile navigation, header and venue directions, hero CTA, the original invitation preview and download, the 1200 × 630 sharing image, and countdown states before and after the ceremony. Responsive checks cover thirteen portrait, landscape and desktop sizes from 320 × 480 to 1440 × 1000. Text enlargement is checked at 200% at widths 320, 390, 768 and 1440. Typical portrait sections fit one screen; smaller screens and enlarged text allow vertical scrolling without clipping or horizontal overflow. The opening sequence is checked separately for the real hero reveal, skip, keyboard focus, replay, and reduced motion. Screenshots are saved in the ignored `artifacts/` directory.

The project runs locally by default. Source is stored in the owner's GitHub repository; hosting is configured separately. Installed dependencies, build output, review artifacts, environment files, and local Sites settings are excluded from Git. Local development and production builds do not require `.openai/hosting.json`.
