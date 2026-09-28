# Langi Ghiran — LG Recycling website

Draft site for LG Recycling (Langi Ghiran Recycling), part of Recycle Group.

The whole site is plain HTML, CSS and JS in this repo's root, served by GitHub Pages
(Settings → Pages → Deploy from a branch → `main` / `/ (root)`).
The header and footer are repeated in each page, so change them in all six.

## Forms
The enquiry and soil declaration forms post to `send-enquiry.php` and `send-declaration.php`, the same pattern as nunjara.com. They reply with JSON (`{ ok, reference }`) and email each submission, with the signature and any classification report attached.

**GitHub Pages can't run PHP**, so the forms only work once the site is on PHP hosting (where Nunjara is hosted). Set the receiving inbox and sender address in `forms-config.php` first.

Items marked **TBC** on the site are placeholders awaiting confirmation. The site is set to noindex until launch.
