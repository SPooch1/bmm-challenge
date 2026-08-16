#!/usr/bin/env node
/**
 * Generates the cigar box guitar illustrations used in the gallery.
 *
 * IMPORTANT: these are stand-in illustrations, not photographs of the real
 * instruments. To use real photos, drop them in assets/img/ and update the
 * <img src> values in index.html — nothing else depends on these files.
 *
 * Usage: node tools/make-guitars.js
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'img');

// One entry per gallery instrument.
const BUILDS = [
  { id: 1, label: 'EMBER',     box: '#7d2d1f', wood: '#b57b3c', strings: 3 },
  { id: 2, label: 'DELTA',     box: '#3f4a3a', wood: '#c99049', strings: 3 },
  { id: 3, label: 'SCOVILLE',  box: '#a8341f', wood: '#8d5a2b', strings: 4 },
  { id: 4, label: 'MIDNIGHT',  box: '#25272e', wood: '#a06c33', strings: 3 },
  { id: 5, label: 'HABANERO',  box: '#b5621d', wood: '#7f5227', strings: 4 },
  { id: 6, label: 'JUKE',      box: '#5c3a6e', wood: '#bb8340', strings: 3 },
  { id: 7, label: 'SMOKEHOUSE',box: '#6b4322', wood: '#9c6a35', strings: 4 },
  { id: 8, label: 'CAYENNE',   box: '#94202b', wood: '#b07c3e', strings: 3 },
  { id: 9, label: 'TENSION',   box: '#2f4858', wood: '#c08a45', strings: 4 },
];

/** Darken a #rrggbb hex colour by `amount` (0..1). */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(c * (1 - amount))))
  );
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Fret positions along the neck, tightening toward the box (rule of 18). */
function fretPositions(nutX, scaleLength, count) {
  const out = [];
  let remaining = scaleLength;
  let x = nutX;
  for (let i = 0; i < count; i++) {
    const step = remaining / 17.817;
    x += step;
    remaining -= step;
    out.push(x);
  }
  return out;
}

function guitarSvg(b) {
  const { label, box, wood, strings } = b;
  const woodDark = shade(wood, 0.35);
  const woodDeep = shade(wood, 0.55);
  const boxDark = shade(box, 0.3);
  const boxDeep = shade(box, 0.5);
  const brass = '#d9a441';
  const brassDark = '#a97c26';

  // Geometry
  const nutX = 182;
  const neckTop = 224;
  const neckBot = 292;
  const boxL = 700, boxR = 1152, boxT = 108, boxB = 412;
  const tailX = 1112;

  const frets = fretPositions(nutX, 560, 11);
  const markers = [frets[2], frets[4], frets[6], frets[9]];

  // Strings, evenly spread across the neck.
  const span = strings === 4 ? 52 : 40;
  const mid = (neckTop + neckBot) / 2;
  const stringYs = Array.from({ length: strings }, (_, i) =>
    mid - span / 2 + (span / (strings - 1)) * i
  );

  // Tuner pegs alternate above/below the headstock.
  const tuners = stringYs.map((y, i) => ({
    x: 78 + (i % 2) * 46,
    y: i % 2 === 0 ? 186 : 330,
    stringY: y,
  }));

  const grain = Array.from({ length: 7 }, (_, i) => {
    const y = neckTop + 8 + i * 8;
    return `<path d="M${nutX} ${y} Q ${nutX + 180} ${y - 3}, ${nutX + 360} ${y + 2} T ${boxL + 20} ${y}" stroke="${woodDeep}" stroke-width="1" fill="none" opacity=".28"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1220 520" role="img" aria-label="Illustration of a ${strings}-string cigar box guitar, the ${label} build">
  <defs>
    <linearGradient id="w${b.id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${wood}"/>
      <stop offset=".55" stop-color="${woodDark}"/>
      <stop offset="1" stop-color="${woodDeep}"/>
    </linearGradient>
    <linearGradient id="b${b.id}" x1="0" y1="0" x2=".3" y2="1">
      <stop offset="0" stop-color="${box}"/>
      <stop offset=".6" stop-color="${boxDark}"/>
      <stop offset="1" stop-color="${boxDeep}"/>
    </linearGradient>
    <radialGradient id="g${b.id}" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#ffb46b" stop-opacity=".16"/>
      <stop offset="1" stop-color="#ffb46b" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <ellipse cx="620" cy="470" rx="520" ry="26" fill="#000" opacity=".28"/>
  <rect width="1220" height="520" fill="url(#g${b.id})"/>

  <!-- headstock -->
  <path d="M52 196 L176 214 L176 302 L52 322 Z" fill="url(#w${b.id})" stroke="${woodDeep}" stroke-width="2" stroke-linejoin="round"/>
  <text x="114" y="266" font-family="Georgia, serif" font-size="19" fill="${boxDeep}" text-anchor="middle" opacity=".75" letter-spacing="1">Tension</text>
  ${tuners
    .map(
      (t) => `<g>
    <line x1="${t.x}" y1="${t.y}" x2="${t.x}" y2="${t.stringY}" stroke="${brassDark}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="${t.x}" cy="${t.y}" r="14" fill="${brass}" stroke="${brassDark}" stroke-width="2.5"/>
    <circle cx="${t.x}" cy="${t.y}" r="5" fill="${brassDark}" opacity=".7"/>
  </g>`
    )
    .join('\n  ')}

  <!-- neck -->
  <rect x="${nutX - 8}" y="${neckTop - 4}" width="10" height="${neckBot - neckTop + 8}" rx="3" fill="#efe3cd" stroke="${woodDeep}" stroke-width="1.5"/>
  <rect x="${nutX}" y="${neckTop}" width="${boxL - nutX + 40}" height="${neckBot - neckTop}" fill="url(#w${b.id})"/>
  ${grain}
  ${frets.map((x) => `<line x1="${x.toFixed(1)}" y1="${neckTop}" x2="${x.toFixed(1)}" y2="${neckBot}" stroke="#e6d9c0" stroke-width="2.5" opacity=".85"/>`).join('\n  ')}
  ${markers.map((x) => `<circle cx="${x.toFixed(1)}" cy="${mid}" r="5" fill="#f3e7d2" opacity=".55"/>`).join('\n  ')}

  <!-- cigar box body -->
  <rect x="${boxL}" y="${boxT}" width="${boxR - boxL}" height="${boxB - boxT}" rx="12" fill="url(#b${b.id})" stroke="${boxDeep}" stroke-width="3"/>
  <rect x="${boxL + 14}" y="${boxT + 14}" width="${boxR - boxL - 28}" height="${boxB - boxT - 28}" rx="8" fill="none" stroke="${brass}" stroke-width="2" opacity=".45"/>

  <!-- lid label -->
  <rect x="${boxL + 170}" y="${boxT + 74}" width="200" height="152" rx="8" fill="#f2e6d2" opacity=".93"/>
  <rect x="${boxL + 180}" y="${boxT + 84}" width="180" height="132" rx="5" fill="none" stroke="${boxDeep}" stroke-width="2"/>
  <text x="${boxL + 270}" y="${boxT + 128}" font-family="Georgia, serif" font-size="17" fill="${boxDeep}" text-anchor="middle" letter-spacing="3">HOT SAUCE</text>
  <text x="${boxL + 270}" y="${boxT + 162}" font-family="Georgia, serif" font-weight="bold" font-size="${label.length > 8 ? 20 : 26}" fill="${shade(box, 0.65)}" text-anchor="middle" letter-spacing="1">${label}</text>
  <text x="${boxL + 270}" y="${boxT + 192}" font-family="Georgia, serif" font-size="14" fill="${boxDeep}" text-anchor="middle" letter-spacing="2">No. ${String(b.id).padStart(2, '0')}</text>

  <!-- sound holes -->
  <circle cx="${boxL + 86}" cy="${boxT + 66}" r="17" fill="${boxDeep}"/>
  <circle cx="${boxL + 86}" cy="${boxB - boxT - 6}" r="17" fill="${boxDeep}"/>

  <!-- humbucker, bridge, tailpiece -->
  <rect x="${boxL + 62}" y="${mid - 44}" width="44" height="88" rx="5" fill="#1b1b1f" stroke="${brassDark}" stroke-width="2"/>
  ${stringYs.map((y) => `<circle cx="${boxL + 84}" cy="${y}" r="3.5" fill="#cfd2d6"/>`).join('\n  ')}
  <rect x="${boxL + 300}" y="${mid - 52}" width="16" height="104" rx="3" fill="${brass}" stroke="${brassDark}" stroke-width="2"/>
  <rect x="${tailX}" y="${mid - 46}" width="22" height="92" rx="4" fill="${brass}" stroke="${brassDark}" stroke-width="2"/>
  <circle cx="${boxL + 40}" cy="${boxB - 46}" r="13" fill="${brass}" stroke="${brassDark}" stroke-width="2"/>
  <circle cx="${boxL + 40}" cy="${boxT + 46}" r="13" fill="${brass}" stroke="${brassDark}" stroke-width="2"/>

  <!-- strings -->
  ${stringYs
    .map(
      (y, i) =>
        `<line x1="112" y1="${y}" x2="${tailX + 6}" y2="${y}" stroke="#e9edf2" stroke-width="${1.4 + i * 0.45}" opacity=".9"/>`
    )
    .join('\n  ')}
</svg>
`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const b of BUILDS) {
    const file = path.join(OUT_DIR, `guitar-${String(b.id).padStart(2, '0')}.svg`);
    fs.writeFileSync(file, guitarSvg(b));
    console.log('wrote', path.relative(process.cwd(), file));
  }
}

if (require.main === module) main();

module.exports = { BUILDS, guitarSvg };
