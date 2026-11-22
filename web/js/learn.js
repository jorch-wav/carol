// Learning layer: out of the way until asked for. Overview, deep dive, how Carol sings it, sources.
import { icon } from './icons.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const link = (url, text) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text || url)}</a>` : esc(text);

const BODY_LABEL = { songbird: 'songbird', kingfisher: 'non-songbird, two coupled membranes', parrot: 'parrot', dove: 'dove (closed-beak coo)' };
const BODY_TEXT = {
  songbird: `Songbirds (oscines) have a two-sided syrinx where the windpipe splits into the bronchi. Each side has its own pair of labia, driven by its own muscles, so the left and right can sing different notes at once. Many songbirds sing low notes on the left side and high notes on the right. The sound then passes up the windpipe, through the throat cavity (which the bird re-sizes to follow the note) and out of the beak, whose gape widens for higher notes.`,
  kingfisher: `Kingfishers, kookaburras and many other non-songbirds have a simpler syrinx where the trachea meets the bronchi, with vibrating membranes on each side. No published physical model of these voices exists yet, so Carol uses two coupled membrane oscillators: when they push on each other strongly enough the motion turns irregular, which gives the rough, chopped quality of a kookaburra's laugh. Treat this model as a best guess, and see the match score for how close it gets.`,
  dove: `Pigeons and doves coo with the beak shut. Their syrinx sits where the windpipe meets the bronchi, and thin membranes there set the air vibrating. Before cooing the bird fills its oesophagus with air and inflates it like a balloon. Experiments on ring doves (Riede et al. 2004; Fletcher et al. 2004) showed that this inflated sac is a resonator tuned close to the note, and that its thin wall radiates the sound straight through the skin of the neck. That is why a coo is so soft, low and pure. Carol models this as one sound source, a windpipe, and a neck-sac resonance that follows the note, mixed with a little sound leaking from the closed beak.`,
  parrot: `Parrots have a syrinx at the bottom of the windpipe with a single sound source, set vibrating by thin membranes on each side. What makes parrots special is the mouth: their thick, muscular tongue shapes resonances much like we shape vowels. Carol models this with two tongue-controlled resonances. The parrot model is rougher than the songbird one.`,
};

import { zoomable } from './zoom.js';

export class Learn {
  constructor(app) {
    this.app = app; this.tab = 'overview';
    this.figs = [];
    // the Pi's page server can play the source recordings (A/B); GitHub Pages can't
    this.local = false;
    if (/(\.ts\.net|localhost|127\.0\.0\.1)$/.test(location.hostname)) fetch('tempo', { cache: 'no-store' }).then((r) => { this.local = r.ok && (r.headers.get('content-type') || '').includes('json'); }).catch(() => {});
    fetch('img/learn/illustrations.json').then((r) => r.json()).then((d) => { this.figs = d; if (this.openNow && this.tab === 'anatomy') this.show('anatomy'); }).catch(() => {});
    // full-screen viewer for a figure (pinch / drag / double-tap)
    const vw = document.getElementById('viewer');
    this.zoom = zoomable(document.getElementById('vwBox'), document.getElementById('vwImg'));
    vw.querySelector('[data-close]').onclick = () => { vw.hidden = true; };
    this.el = document.getElementById('learn');
    this.body = document.getElementById('llBody');
    this.el.querySelector('[data-close]').onclick = () => this.close();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    document.querySelectorAll('#llTabs button').forEach((b) => b.onclick = () => this.show(b.dataset.tab));
  }
  open(tab) { this.el.hidden = false; this.show(tab || this.tab); }
  close() { this.el.hidden = true; this.stopReal(); }
  stopReal() { if (this.real) { this.real.pause(); this.real = null; } }
  get openNow() { return !this.el.hidden; }
  show(tab) {
    this.tab = tab;
    document.querySelectorAll('#llTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const b = this.app.bird; if (!b) return;
    const info = b.info || {}, dd = info.deep_dive || {};
    const tx = b.taxonomy || {};
    let h = `<h1>${esc(b.name)}</h1><p class="sci"><i>${esc(b.sci)}</i> ${esc(tx.authority || '')}${tx.family ? ' · ' + esc(tx.family) + ', ' + esc(tx.order) : (info.family ? ' · ' + esc(info.family) : '')}</p>`;
    if (tab === 'overview') {
      const pl = this.app.plateOf(b);
      if (pl) h += `<img class="plate-small" src="${esc(pl.image)}" alt="${esc(b.name)}, ${esc(pl.artist || tx.plate_artist || 'John Gould')}">`;
      h += `<p class="lede">${esc(info.overview || 'No notes for this bird yet.')}</p>`;
      h += `<p><button class="tour-cta" data-tour>${icon('play')} TAKE THE TOUR</button> <small>Hear what each part of the body does, one step at a time.</small></p>`;
      if (b.match) h += `<p>Carol's model of this bird matches its recordings at <b>${Math.round(b.match.total)}%</b>. Open <i>How Carol sings it</i> to see why.</p>`;
    } else if (tab === 'deep') {
      if (tx.genus) {
        h += `<h2>Taxonomy</h2><table class="tax">
          <tr><th>Order</th><td>${esc(tx.order)}</td></tr>
          <tr><th>Family</th><td>${esc(tx.family)}</td></tr>
          <tr><th>Genus</th><td><i>${esc(tx.genus)}</i></td></tr>
          <tr><th>Species</th><td><i>${esc(tx.genus)} ${esc(tx.species)}</i> ${esc(tx.authority)}</td></tr>
          <tr><th>First described as</th><td><i>${esc(tx.original.split(' ').slice(0, 2).join(' '))}</i> ${esc(tx.original.split(' ').slice(2).join(' '))}</td></tr>
          ${tx.plate_name ? `<tr><th>On ${esc((tx.plate_artist || 'John Gould').split(' ').pop())}'s plate</th><td><i>${esc(tx.plate_name)}</i> (${esc(tx.plate_common)})${tx.plate_name !== b.sci ? ', an older name' : ''}</td></tr>` : ''}
          <tr><th>Reference list</th><td>${link(tx.ioc_url, tx.list)}${tx.gbif_url ? ' · ' + link(tx.gbif_url, 'GBIF') : ''}${tx.afd_url ? ' · ' + link(tx.afd_url, 'Australian Faunal Directory') : ''}</td></tr>
        </table>
        <p><small>Brackets around the author and year mean the species was first described in a different genus and has since been moved.</small></p>`;
      }
      for (const [k, t] of [['habitat', 'Habitat'], ['range', 'Range'], ['behaviour', 'Behaviour'], ['voice', 'Voice'], ['anatomy', 'Voice anatomy']]) {
        if (dd[k]) h += `<h2>${t}</h2><p>${esc(dd[k])}</p>`;
      }
    } else if (tab === 'anatomy') {
      h += `<p>How a bird makes sound, in reference drawings: breathing first, then the syrinx where the voice is made. Tap a picture to see it full screen.</p>`;
      for (const [topic, head] of [['breathing', 'Breathing: the power supply'], ['syrinx', 'The syrinx: the voice box'], ['voice', 'Songbird and non-songbird syrinx']]) {
        const figs = this.figs.filter((f) => f.topic === topic);
        if (!figs.length) continue;
        h += `<h2>${head}</h2>`;
        for (const f of figs) {
          const i = this.figs.indexOf(f);
          h += `<figure class="fig"><img src="img/learn/${esc(f.file)}" alt="${esc(f.title)}" data-fig="${i}"><figcaption><b>${esc(f.title)}</b><br>${esc(f.caption)}${f.legend ? `<br><small class="legend">${esc(f.legend)}</small>` : ''}<br><small>${esc(f.credit)} ${link(f.source_url, 'Source')} · ${link(f.licence_url, f.licence)}</small></figcaption></figure>`;
        }
      }
      if (!this.figs.length) h += '<p>No illustrations found.</p>';
    } else if (tab === 'voice') {
      h += `<h2>Body type: ${esc(BODY_LABEL[b.body] || b.body)}</h2><p>${BODY_TEXT[b.body] || ''}</p>`;
      if (b.model_note) h += `<h2>This bird</h2><p>${esc(b.model_note)}</p>`;
      h += `<h2>How the preset was made</h2><p>Carol tracked the pitch and loudness of ${b.calls.length} clear calls from ${new Set(b.calls.map((c) => c.source)).size} recordings. These became the call shapes you play. Then the fitter tried body settings again and again, keeping whatever brought the synth's spectrum closest to the recordings.</p>`;
      if (b.match) {
        h += `<div class="score"><div><b>${Math.round(b.match.total)}%</b>overall</div><div><b>${b.match.pitch_cents}¢</b>pitch error</div><div><b>${b.match.loud_db} dB</b>loudness error</div><div><b>${b.match.spec_db} dB</b>spectrum error</div></div>`;
        h += `<p><small>Pitch error is in cents (100 = one semitone). Loudness and spectrum errors are average differences in decibels, compared frame by frame.</small></p>`;
        const ab = this.local && !b.user;
        if (ab) h += `<p><b>A/B:</b> press <b>REAL</b> to hear the recording, then <b>CAROL</b> to hear the model sing the same call (with your knob changes). The recordings stay on the Pi.</p>`;
        else h += `<p><small>On the Pi you can A/B each call against its recording here.</small></p>`;
        h += `<table><tr><th>Call</th><th>From</th><th>Match</th><th>Spectrum</th>${ab ? '<th>Listen</th>' : '<th></th>'}</tr>` + b.calls.map((c, i) => `<tr><td>${esc(c.name)}</td><td>${esc(c.source)} ${c.start.toFixed(1)}s</td><td>${c.match ? Math.round(c.match.total) + '%' : '–'}</td><td>${c.match ? c.match.spec_db + ' dB' : ''}</td><td><span class="ab">${ab ? `<button class="real" data-real="${i}">REAL</button>` : ''}<button data-carol="${i}">CAROL</button></span></td></tr>`).join('') + `</table>`;
      }
      h += `<h2>Reading the knobs and views</h2><ul>
        <li><b>Amber arc on a knob:</b> while a call plays, it runs from where the knob is set to where the call is moving that value right now (breath, tension, closure, throat, tongue, beak). The knob is the bird's starting point; the call is the movement.</li>
        <li><b>Small amber dot by a knob:</b> the real bird's setting, as fitted from its recordings. Double-tap a knob to go back to it.</li>
        <li><b>HARSHNESS</b> (in LUNGS) adds irregular, partly chaotic vibration: alternate cycles stronger and weaker, wobbling cycle lengths and noisy bursts, the roughness of screeches and caws. Every bird starts at 0.</li>
        <li><b>3D view:</b> double-tap to show the live readouts (pitch, air pressure, throat and mouth resonances, beak gape), each in its organ's colour; double-tap again for just the bird. Two fingers zoom.</li>
      </ul>`;
      h += `<h2>The physics</h2><p>The labia are modelled as a nonlinear oscillator from Gabriel Mindlin's lab at the University of Buenos Aires. Air-sac pressure and labial tension decide whether the labia vibrate at all, and how: high tension gives a pure whistle, low tension a buzz of pulses. The sound then travels through a windpipe with echoes, the throat cavity and the beak.</p>`;
    } else if (tab === 'sources') {
      const s = b.sources || {};
      h += `<h2>Recordings</h2><table><tr><th>Recording</th><th>Recordist</th><th>Licence</th><th>Place, date</th></tr>` +
        (s.recordings || []).map((r) => `<tr><td>${link(r.url, r.id)}</td><td>${esc(r.recordist)}</td><td>${link(r.licence_url, r.licence)}</td><td>${esc(r.location || '')} ${esc(r.date || '')}</td></tr>`).join('') + `</table>`;
      if (s.plates && s.plates.length) h += `<h2>Illustrations</h2><ul>` + s.plates.map((p) => `<li>${esc(p.credit)}. ${link(p.url, 'Scan')}${p.bhl ? ' · ' + link(p.bhl, 'Biodiversity Heritage Library') : ''}. ${esc(p.licence || 'Public domain')}.</li>`).join('') + `</ul>`;
      else if (s.image) h += `<h2>Illustration</h2><p>${esc(s.image.credit)}. ${link(s.image.url, s.image.source || 'Source')}${s.image.bhl ? ' · ' + link(s.image.bhl, 'Biodiversity Heritage Library') : ''}. ${esc(s.image.licence || 'Public domain')}.</p>`;
      if ((s.facts || []).length) h += `<h2>Facts</h2><ul>` + s.facts.map((f) => `<li>${link(f.url, f.title)}${f.licence ? ' — ' + esc(f.licence) : ''}${f.used_for ? ' <small>(' + esc(f.used_for) + ')</small>' : ''}</li>`).join('') + `</ul>`;
      if (this.figs.length) h += `<h2>Anatomy illustrations</h2><ul>` + this.figs.map((f) => `<li>${esc(f.title)}: ${esc(f.credit)} ${link(f.source_url, 'Source')} · ${link(f.licence_url, f.licence)}${f.modified ? ' <small>(' + esc(f.modified) + ')</small>' : ''}</li>`).join('') + `</ul>`;
      h += `<h2>Science</h2><ul>` + (s.science || []).map((f) => `<li>${link(f.url, f.title)}</li>`).join('') + `</ul>`;
      if (s.licence_note) h += `<p><small>${esc(s.licence_note)}</small></p>`;
    }
    this.body.innerHTML = h;
    this.body.scrollTop = 0;
    const tb = this.body.querySelector('[data-tour]'); if (tb) tb.onclick = () => this.app.tour.start();
    this.body.querySelectorAll('[data-carol]').forEach((x) => x.onclick = () => { this.stopReal(); this.app.playCall('ab', Number(x.dataset.carol)); setTimeout(() => this.app.release('ab'), 60); });
    this.body.querySelectorAll('[data-real]').forEach((x) => x.onclick = () => {
      const c = b.calls[Number(x.dataset.real)];
      this.stopReal();
      this.real = new Audio(`clip?bird=${encodeURIComponent(b.id)}&src=${encodeURIComponent(c.source)}&start=${c.start}&end=${c.end}`);
      this.real.play().catch(() => this.app.toast('Recording not available here'));
    });
    this.body.querySelectorAll('img[data-fig]').forEach((im) => im.onclick = () => {
      const f = this.figs[Number(im.dataset.fig)];
      document.getElementById('vwImg').src = im.src;
      document.getElementById('vwCap').textContent = f.title + ' · ' + f.credit;
      this.zoom.reset(); document.getElementById('viewer').hidden = false;
    });
  }
}
