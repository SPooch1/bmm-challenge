# Hot Sauce Guitar Kitchen — website

A static marketing site for Hot Sauce Guitar Kitchen, handmade cigar box guitars
out of Columbus, Ohio.

Vanilla HTML/CSS/JS. No framework, no build step — open `index.html` or serve the
folder and it runs.

```
python3 -m http.server 8000     # then visit http://localhost:8000
```

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
| Guitar photos | `assets/img/guitar-*.svg` | Currently illustrations, **not photographs** — see below. |
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

## Deploying

It's a static folder — any host works. Note that this repo's root `firebase.json`
serves `public/` for the BMM Challenge app, so deploying this site through the
same Firebase project would need its own hosting target rather than reusing that
config.
