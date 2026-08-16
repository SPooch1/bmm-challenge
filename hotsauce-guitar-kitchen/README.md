# Hot Sauce Guitar Kitchen — website

A static marketing site for Hot Sauce Guitar Kitchen, handmade cigar box guitars
out of Columbus, Ohio.

Vanilla HTML/CSS/JS. No framework, no build step — open `index.html` or serve the
folder and it runs.

```
python3 -m http.server 8000     # then visit http://localhost:8000
```

## Design

Light theme on blush paper (`#fff8fb`) with pink as the primary, a rainbow
accent used for the ticker/CTA/gradient text, and a unicorn as the shop mark
(`assets/img/logo.svg`, `favicon.svg`).

Two rainbows are defined in `css/styles.css` on purpose:

- `--rainbow` — the soft pastel version, for decoration only (the quote card's
  edge stripe). It washes out under white text.
- `--rainbow-text` — a saturated version used anywhere text sits on top:
  gradient headings, the ticker, the closing CTA. The ticker and CTA also layer
  a dark scrim over it, because the bare gradient's orange stop measured
  3.05:1 against white and needed to clear 4.5:1.

If you restyle, re-check those two surfaces — pastel rainbows and white text
are the easy way to break legibility here.

## Layout

```
index.html            single page — hero, gallery, story, process, commissions, FAQ
css/styles.css        all styles
js/site.js            nav, gallery filters, scroll reveal, commission form
assets/img/           logo, favicon, generated guitar illustrations
tools/make-guitars.js regenerates the guitar illustrations
```

## Before this goes live

Instagram is login-walled to automated fetching, so the page content was built
from the shop's public footprint rather than from the account itself. **These
items are placeholders and need real values:**

| What | Where | Notes |
|---|---|---|
| Shop email | `js/site.js` → `SHOP_EMAIL` | Currently `hello@example.com`. The form opens the visitor's mail client; it does not send anything on its own. |
| Social links | `index.html` → footer, marked `EDIT:` | Instagram/YouTube/Reverb URLs need the real profiles. |
| Prices | `index.html` → commission tiers | Deliberately left as "Quoted per build" rather than inventing numbers. Add real figures if you want them public. |
| Guitar photos | `assets/img/guitar-*.svg` | Currently pastel illustrations, **not photographs** — see below. |
| Build names / specs / sold status | `index.html` → `.card` blocks | The nine gallery entries are plausible examples, not a real inventory. |

### Swapping in real photos

The gallery images are generated SVG illustrations standing in for real photos.
To use actual photographs, drop them in `assets/img/` and change the `<img src>`
on each `.card`:

```html
<div class="card-img"><img src="assets/img/build-01.jpg" alt="..." loading="lazy"></div>
```

Nothing else depends on the SVGs. Keep images roughly 3:1 landscape to match the
current card proportions, and update each `alt` to describe the actual guitar.

To regenerate or restyle the illustrations instead, edit the `BUILDS` array in
`tools/make-guitars.js` and run:

```
node tools/make-guitars.js
```

### Taking form submissions

`js/site.js` validates the commission form and then hands off to `mailto:`. For
real submissions, point the `<form>` at a form service (Formspree, Basin, Netlify
Forms) and delete the mailto fallback in the submit handler.

## Content sourced from public material

These details are accurate as of writing and came from published sources rather
than being invented:

- Founded by **Brian Davenport**, Columbus, Ohio
- Started after finding *The Handmade Music Factory* at a library
- Three- and four-string builds; fretted necks, intonatable bridges, humbucker
  pickups with working volume and tone
- A glass slide ships with every build — the origin of the "hot sauce" name
- **"Tension"** is written on every headstock, from Davenport's line about living
  in the tension to make music
- Featured on Spectrum News 1, Columbus (2021)

The quote in the Story section is his, from that Spectrum News 1 piece. Everything
else in the copy is marketing voice written for the shop and can be freely edited.

## Accessibility / robustness notes

- Reveal animations only engage when JS is running (`html.js`), so the page never
  renders blank without JS.
- `prefers-reduced-motion` disables the ticker, sway, and reveal animations.
- Verified in Chromium at 1440px and 390px: no horizontal overflow, working
  mobile menu, working gallery filters, keyboard-focusable form fields.
- Contrast on the two gradient surfaces was measured from rendered pixels, not
  eyeballed: ticker 5.30:1 and CTA 4.92:1 against white, both clearing WCAG AA
  for normal-size text.

## Deploying

It's a static folder — any host works. Note that this repo's root `firebase.json`
serves `public/` for the BMM Challenge app, so deploying this site through the
same Firebase project would need its own hosting target rather than reusing that
config.
