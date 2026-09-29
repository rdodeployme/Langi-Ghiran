# Langi Ghiran — LG Recycling website

Draft site for LG Recycling (Langi Ghiran Recycling), part of Recycle Group.

The whole site is plain HTML, CSS and JS in this repo's root, served by GitHub Pages
(Settings → Pages → Deploy from a branch → `main` / `/ (root)`).
The header, footer and call-to-action band are repeated in each page, so change them in all six.

## What's on the site
- **Home**: cinematic video hero, soil checker, before/after restoration slider, process, find us, enquiry form.
- **Soil checker** (home and Soil Disposal): a three-step guide. A suitable result links to the declaration with the material and safety answers pre-filled.
- **Soil declaration**: six-step form with validation per step, a review screen, signature pad, and progress saved in the browser until it's submitted.
- **Site safety**: rules, arrival steps, and a printable driver briefing card.
- `assets/og-image.jpg` is the preview image shown when a page link is shared.

## Forms
The enquiry and soil declaration forms post to `send-enquiry.php` and `send-declaration.php`, the same pattern as nunjara.com. They reply with JSON (`{ ok, reference }`) and email each submission, with the signature and any classification report attached.

**GitHub Pages can't run PHP**, so the forms only work once the site is on PHP hosting (where Nunjara is hosted). Set the receiving inbox and sender address in `forms-config.php` first.

## Content
Items marked **TBC** on the site are placeholders awaiting confirmation. Photography and the before/after images are AI-generated and illustrative; replace them with real site photos before launch. The site is set to noindex until launch.
