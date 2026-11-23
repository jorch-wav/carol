// Presets screen, tied to the BIRD knob. A catalogue: one tab per collection, its birds below,
// the selected bird's plate on the left. New collections just add a tab.
import { icon } from './icons.js';
const BODY_NAME = { kingfisher: 'non-songbird' };
const bodyName = (b) => BODY_NAME[b] || b;
const FAV = 'Favourites';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export class Presets {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('presets');
    this.list = document.getElementById('psList');
    this.cats = document.getElementById('psCats');
    this.about = document.getElementById('psAbout');
    this.coll = null; this.hi = 0; this.visible = []; this.q = ''; this.area = null;
    // area filter chips under the region tabs (a field guide's distribution filter)
    this.chips = document.createElement('div'); this.chips.className = 'ps-chips'; this.chips.id = 'psChips'; this.cats.after(this.chips);
    this.favs = new Set(lsGet('carol-favs', []));
    const search = document.getElementById('psSearch');
    search.oninput = () => { this.q = search.value.trim().toLowerCase(); this.hi = 0; this.render(); };
    this.el.querySelector('[data-close]').onclick = () => this.close();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
  }
  collections() {
    const known = this.app.collections || [];
    const names = [...new Set(this.app.index.map((b) => b.collection || ''))];
    const out = known.filter((c) => names.includes(c.name));
    for (const n of names) if (!out.some((c) => c.name === n)) out.push({ name: n });
    const favs = this.app.index.filter((b) => this.favs.has(b.id)).length;
    if (favs) out.unshift({ name: FAV, region: 'your favourites', about: 'Tap the star next to any bird to add it here.' });
    return out;
  }
  birdsIn(c, all = false) {
    const list = c === FAV ? this.app.index.filter((b) => this.favs.has(b.id)) : this.app.index.filter((b) => (b.collection || '') === c);
    if (all || !this.area || c !== this.coll) return list;
    return list.filter((b) => (b.areas || []).includes(this.area) || (b.introduced || []).includes(this.area));
  }
  /** The area chips for the current tab: only areas its birds live in, in a fixed order; tap to filter, again to clear. */
  renderChips() {
    const order = Object.keys(this.app.areaNames || {});
    const birds = this.birdsIn(this.coll, true), have = new Set(birds.flatMap((b) => (b.areas || []).concat(b.introduced || [])));
    const areas = order.filter((a) => have.has(a) && a !== 'WORLD');
    if (this.area && !areas.includes(this.area)) this.area = null;
    this.chips.hidden = !!this.q || areas.length < 2;
    this.chips.innerHTML = '';
    for (const a of [null, ...areas]) {
      const c = document.createElement('button');
      c.className = 'ps-chip' + (a === this.area ? ' on' : '');
      c.textContent = a ? this.app.areaNames[a] : 'All areas';
      c.onclick = () => { this.area = a === this.area ? null : a; this.hi = 0; this.render(); };
      this.chips.appendChild(c);
    }
  }
  found() {
    const q = this.q;
    return this.app.index.filter((b) => [b.name, b.sci, b.family, b.order, b.collection, bodyName(b.body), ...((b.tags && b.tags.region) || []), ...((b.tags && b.tags.features) || [])].join(' ').toLowerCase().includes(q));
  }
  toggleFav(id) { this.favs.has(id) ? this.favs.delete(id) : this.favs.add(id); lsSet('carol-favs', [...this.favs]); }
  renderCats() {
    const cs = this.collections();
    if (!cs.some((c) => c.name === this.coll)) this.coll = cs.length ? cs[0].name : null;
    this.cats.innerHTML = '';
    for (const c of cs) {
      const t = document.createElement('button');
      t.className = 'ps-cat' + (c.name === this.coll ? ' on' : '');
      t.setAttribute('role', 'tab');
      t.innerHTML = '<b></b><small></small>';
      t.querySelector('b').textContent = c.name;
      const nb = this.birdsIn(c.name, true).length;
      t.querySelector('small').innerHTML = `${nb} bird${nb === 1 ? '' : 's'}<span class="rg">${c.region ? ' · ' + c.region.replace(/[&<>]/g, '') : ''}</span>`;
      t.onclick = () => { if (this.coll !== c.name) this.area = null; this.coll = c.name; this.hi = 0; this.render(); };
      this.cats.appendChild(t);
    }
    const cur = cs.find((c) => c.name === this.coll);
    this.about.textContent = (cur && cur.about) || '';
    const on = this.cats.querySelector('.on'); on && on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  render() {
    this.renderCats(); this.renderChips();
    this.cats.style.display = this.q ? 'none' : '';
    const items = this.q ? this.found() : this.birdsIn(this.coll);
    if (this.q) this.about.textContent = items.length ? `${items.length} found` : 'No birds match.';
    this.visible = items;
    this.hi = Math.min(this.hi, Math.max(0, items.length - 1));
    this.list.innerHTML = '';
    let fam = null;
    items.forEach((b, i) => {
      // family headings, in taxonomic order (the index is already sorted that way)
      if (b.family && b.family !== fam && !this.q) {
        fam = b.family;
        const h = document.createElement('li'); h.className = 'fam';
        h.innerHTML = '<span></span><i></i>'; h.querySelector('span').textContent = b.family_name || b.family; h.querySelector('i').textContent = b.family;
        this.list.appendChild(h);
      }
      const li = document.createElement('li');
      li.className = (i === this.hi ? 'hi' : '') + (this.app.bird && b.id === this.app.bird.id ? ' cur' : '');
      li.innerHTML = '<b></b><span class="m"></span><i></i><button class="ps-fav" title="Favourite"></button><small class="rng"></small>';
      const rg = li.querySelector('.rng'); if (b.range) { rg.textContent = b.range; if (b.endemic) rg.insertAdjacentHTML('afterbegin', '<em class="endemic">ENDEMIC</em> '); } else rg.remove();
      const fv = li.querySelector('.ps-fav'); fv.innerHTML = icon(this.favs.has(b.id) ? 'star' : 'starOff'); fv.classList.toggle('on', this.favs.has(b.id));
      fv.onclick = (e) => { e.stopPropagation(); this.toggleFav(b.id); this.render(); };
      li.querySelector('b').textContent = b.name;
      li.querySelector('.m').textContent = b.match != null ? Math.round(b.match) + '%' : '';
      li.querySelector('i').textContent = (b.sci || '') + (b.authority ? ' ' + b.authority : '') + (b.family ? ' · ' + b.family : '') + (b.body ? ' · ' + bodyName(b.body) : '');
      li.onclick = () => { this.hi = i; this.app.loadBird(b.id); this.close(); };
      if (b.mine) {
        li.classList.add('has-del');
        const del = document.createElement('button'); del.className = 'x ps-del'; del.innerHTML = icon('close'); del.title = 'Delete this preset';
        del.onclick = (e) => { e.stopPropagation(); if (confirm(`Delete "${b.name}"?`)) this.app.deleteMyPreset(b.id).then(() => this.render()); };
        li.appendChild(del);
      }
      li.dataset.i = i;
      this.list.appendChild(li);
    });
    this.showPlate();
  }
  showPlate() {
    const b = this.visible[this.hi];
    const img = document.getElementById('psImg'), cap = document.getElementById('psCap');
    if (!b) { img.removeAttribute('src'); cap.textContent = ''; return; }
    const p = this.app.plateOf(b), n = this.app.plates(b).length;
    if (p) img.src = p.image; else img.removeAttribute('src');
    cap.textContent = p ? p.caption : b.name;
    // swipe the plate sideways to see this bird's other plates
    if (!img.dataset.swipe) {
      img.dataset.swipe = '1'; img.draggable = false; img.addEventListener('dragstart', (e) => e.preventDefault());
      let sx = null;
      img.parentElement.addEventListener('pointerdown', (e) => { sx = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      img.parentElement.addEventListener('pointerup', (e) => {
        if (!sx) return; const dx = e.clientX - sx.x, dy = e.clientY - sx.y, quick = performance.now() - sx.t < 700; sx = null;
        const bb = this.visible[this.hi];
        if (bb && quick && Math.abs(dx) > 45 && Math.abs(dy) < Math.abs(dx) * 0.6) this.app.setPlate(bb, this.app.plateIndex(bb) + (dx < 0 ? 1 : -1));
      });
      img.parentElement.style.touchAction = 'pan-y';
    }
    if (n > 1) cap.textContent = `${p.caption}  (${this.app.plateIndex(b) + 1}/${n}, swipe for more)`;
    this.list.querySelectorAll('li[data-i]').forEach((li) => li.classList.toggle('hi', Number(li.dataset.i) === this.hi));
    const cur = this.list.querySelector('li.hi'); cur && cur.scrollIntoView({ block: 'nearest' });
  }
  open() {
    if (!this.el.hidden) return;
    const b = this.app.bird && this.app.index.find((x) => x.id === this.app.bird.id);
    this.coll = b ? (b.collection || '') : this.coll;
    const search = document.getElementById('psSearch'); search.value = ''; this.q = '';
    if (b && this.area && !this.birdsIn(this.coll).some((x) => x.id === b.id)) this.area = null;   // keep the current bird in view
    this.hi = b ? Math.max(0, this.birdsIn(this.coll).findIndex((x) => x.id === b.id)) : 0;
    this.el.hidden = false; this.render();
  }
  close() { this.el.hidden = true; clearTimeout(this.idle); }
  /** BIRD knob turned by d steps: browse; past either end, move on to the next collection. */
  step(d) {
    this.open();
    const cs = this.collections(); if (!cs.length) return;
    let ci = Math.max(0, cs.findIndex((c) => c.name === this.coll));
    let hi = this.hi + d;
    for (let guard = 0; guard < 50; guard++) {
      const n = this.birdsIn(cs[ci].name).length;
      if (hi >= n) { hi -= n; ci = (ci + 1) % cs.length; continue; }
      if (hi < 0) { ci = (ci - 1 + cs.length) % cs.length; hi += this.birdsIn(cs[ci].name).length; continue; }
      break;
    }
    const changed = cs[ci].name !== this.coll;
    this.coll = cs[ci].name; this.hi = hi;
    if (changed) this.render(); else this.showPlate();
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.confirm(false), 1400);
  }
  confirm(close = true) {
    const b = this.visible[this.hi];
    if (b && (!this.app.bird || b.id !== this.app.bird.id)) this.app.loadBird(b.id);
    this.render();
    clearTimeout(this.idle);
    if (close) this.close(); else this.idle = setTimeout(() => this.close(), 2500);
  }
}
