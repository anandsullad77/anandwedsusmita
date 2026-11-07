# ಆನಂದ ಮತ್ತು ಸುಶ್ಮಿತಾ — ಶುಭ ವಿವಾಹ

A Kannada React wedding invitation for **29 November 2026, 12:28 p.m. IST**, at Shri Sharadamba Mangal Karyalaya, Hosapete Galli, Sulebhavi, Belagavi.

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

The production website is generated in `dist/`. Fonts are bundled locally; no Google Fonts connection is required.

## Content and appearance

- `src/main.jsx`: countdown, event time, calendar export, and invitation dialog behavior.
- `src/Invitation.jsx`: the Kannada invitation content and stationery layout.
- `src/Ornaments.jsx`: vector kolam ornaments, religious and venue illustrations, and icon components.
- `src/theme.css`: the supplied palette — `#A53051` pink and `#283A2D` dark green, with `#FFF7EB` and `#F9F0E0` neutral backgrounds.
- `src/stationery.css`: responsive stationery design, woven borders, and reduced-motion support.
- `public/images/as-monogram.svg`: a vector AS monogram redrawn from the supplied logo reference, also used as the favicon.
- `public/images/textile-border.svg`: a repeating vector border inspired by the supplied card's temple peaks, rope lines, and diamond weave. The reference card's wording is not used.
- `public/images/original-invitation.jpeg`: the original invitation supplied by the owner.
- `public/images/wedding-couple-pink-green.png`: the active square couple illustration, recoloured from the owner's image with built-in imagegen to use `#A53051` pink and `#283A2D` dark green. It is displayed in full without cropping. On mobile, the bride and groom details share one row, followed by this image across both columns. The supplied original is retained as `public/images/wedding-couple-in-bloom.png`; the edit prompt is in `docs/illustration-prompt.md`.
- `public/images/wedding-illustration-olive-rose.png`: an illustrative couple generated and recoloured with the built-in imagegen tool to match the ivory, cream, olive, and rose palette; it is not a portrait of the actual couple. The original green and previous coral versions are retained as `public/images/wedding-illustration.png` and `public/images/wedding-illustration-coral.png`. Prompts are in `docs/illustration-prompt.md`.

All displayed numbers use English digits (0–9), with Kannada text throughout the invitation and calendar descriptions. The countdown uses the explicit `+05:30` event time, so it remains correct for guests in other time zones. After the muhurta, it displays a wedding blessing. The calendar download preserves the same instant (`2026-11-29T06:58:00Z`) and includes a one-day reminder. Venue directions open a Google Maps search for the supplied venue and address; no unverified map pin is presented.

## Owner review

Names and place names follow the typed content supplied by the owner. Before sharing with guests, confirm the spellings of **ಸಾಗರೊಳ್ಳಿಭಾವಿ**, **ಯಂಡೊಳ್ಳಿ**, **ಹುನಶ್ಯಾಳ**, **ಬಂಡಗಣೆ**, **ತುಗಲಟ್ಟಿ**, **ಬೀಳಗಿ**, and all family names against the original card. The draft's spelling-check note is deliberately excluded from the guest-facing page.

## Validation

The production build and local Chrome checks cover Kannada fonts, mobile navigation, the original invitation preview and download, the calendar file and time zone, venue links, and countdown states before and after the ceremony. Responsive widths checked: 320, 390, 768, 1024, and 1440 pixels. Screenshots are saved in the ignored `artifacts/` directory.

The project runs locally by default. Source is stored in the owner's GitHub repository; hosting is configured separately. Installed dependencies, build output, review artifacts, environment files, and local Sites settings are excluded from Git. Local development and production builds do not require `.openai/hosting.json`.
