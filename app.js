import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase bağlantısı (publishable key herkese açık bir anahtardır, burada durması normaldir)
const SUPABASE_URL = 'https://legqswkjtxoejpbhziwo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_uTjNn9oD02A9Z1JiH-7_QA_MTVcGcYK';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// 4-4-2: üstten alta forvet, orta saha, defans, kaleci. picks dizisindeki sıra: [K, D1-D4, O1-O4, F1-F2]
const LINES = [
  { zone: 'Forvet', idx: [9, 10] },
  { zone: 'Orta Saha', idx: [5, 6, 7, 8] },
  { zone: 'Defans', idx: [1, 2, 3, 4] },
  { zone: 'Kaleci', idx: [0] }
];
const ZONE_OF = ['Kaleci', 'Defans', 'Defans', 'Defans', 'Defans', 'Orta Saha', 'Orta Saha', 'Orta Saha', 'Orta Saha', 'Forvet', 'Forvet'];

// Formalar: arma/logo yok, sadece takım renkleri (6 dikey şerit)
const K = (a, b, pattern = 'stripe') => pattern === 'half' ? [a, a, a, b, b, b] : pattern === 'solid' ? [a, a, a, a, a, a] : [a, b, a, b, a, b];
const KITS = {
  'Fenerbahçe': K('#F5C400', '#13235B'), 'Galatasaray': K('#C8102E', '#FDB913', 'half'), 'Beşiktaş': K('#111111', '#F2F2F2'),
  'Trabzonspor': ['#7A1E2E', '#7A1E2E', '#5BA4D8', '#5BA4D8', '#7A1E2E', '#7A1E2E'], 'Başakşehir': K('#F26522', '#1B2A4A', 'half'),
  'Göztepe': K('#FFD200', '#D7141A', 'half'), 'Çorum FK': K('#C8102E', '#111111'), 'Samsunspor': K('#D7141A', '#F2F2F2', 'half'),
  'Çaykur Rizespor': K('#1E8E3E', '#1F4FA0'), 'Kasımpaşa': K('#1B2A4A', '#F2F2F2', 'half'), 'Alanyaspor': K('#F28C28', '#1E8E3E', 'half'),
  'Konyaspor': K('#1E8E3E', '#F2F2F2'), 'Amed SK': K('#C8102E', '#1E8E3E', 'half'), 'Gaziantep FK': K('#C8102E', '#111111', 'half'),
  'Gençlerbirliği': K('#C8102E', '#111111', 'half'), 'Kocaelispor': K('#1E8E3E', '#111111'), 'Erzurumspor': K('#1F4FA0', '#F2F2F2', 'half'),
  'Eyüpspor': K('#6B2C91', '#FFD200', 'half')
};
const GK_KIT = K('#3CC8FF', '#3CC8FF', 'solid');
const EMPTY_KIT = K('#1C3352', '#1C3352', 'solid');
let shirtSeq = 0;
function shirt(colors, size = 50) {
  const id = 's' + (++shirtSeq);
  const d = 'M21 5 Q30 10 39 5 L44 7 L56 15 L51 26 L45 23 L45 56 L15 56 L15 23 L9 26 L4 15 L16 7 Z';
  return `<svg width="${size}" height="${size}" viewBox="0 0 60 60" aria-hidden="true"><clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${colors.map((c, i) => `<rect x="${i * 10}" y="0" width="10" height="60" fill="${c}"/>`).join('')}</g><path d="${d}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.2"/></svg>`;
}
const kitFor = (p, idx) => !p ? EMPTY_KIT : idx === 0 ? GK_KIT : (KITS[p.team] || K('#5D6E88', '#5D6E88', 'solid'));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortName = (n) => { const parts = n.split(' '); return parts.length > 1 && n.length > 12 ? parts[0][0] + '. ' + parts.slice(1).join(' ') : n; };
const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

const state = {
  user: null, profile: null, players: [], byId: new Map(), weeks: [],
  tab: 'home', draft: null, source: 'veri'
};

function toast(msg) {
  $toast.textContent = msg; $toast.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { $toast.hidden = true; }, 2600);
}
function fmtDate(d) {
  return new Date(d).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
function countdown(d) {
  const ms = new Date(d) - Date.now();
  if (ms <= 0) return 'Kapandı';
  const h = Math.floor(ms / 36e5), days = Math.floor(h / 24);
  return days > 0 ? `${days} gün ${h % 24} saat` : h > 0 ? `${h} saat ${Math.floor(ms / 6e4) % 60} dk` : `${Math.floor(ms / 6e4)} dk`;
}
const isClosed = (w) => w && new Date(w.deadline) <= Date.now();
const openWeek = () => state.weeks.filter((w) => !isClosed(w)).sort((a, b) => a.id - b.id)[0] || null;
const lastClosedWeek = () => state.weeks.filter(isClosed).sort((a, b) => b.id - a.id)[0] || null;
const currentWeek = () => openWeek() || lastClosedWeek();

// ---------- Başlangıç ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  state.user = session?.user || null;
  if (!state.user) return renderWelcome();
  await loadBase();
  if (!state.profile) return renderWelcome(true);
  showTabs();
  go(state.tab);
}

async function loadBase() {
  const [pl, wk, pr] = await Promise.all([
    sb.from('players').select('id,team,name,position,zone,number').eq('active', true).order('team').order('name').range(0, 1999),
    sb.from('weeks').select('*').order('id'),
    state.user ? sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle() : { data: null }
  ]);
  state.players = pl.data || [];
  state.byId = new Map(state.players.map((p) => [p.id, p]));
  state.weeks = wk.data || [];
  state.profile = pr.data || null;
}

function renderWelcome(hasSession = false) {
  $tabs.hidden = true;
  $app.innerHTML = `
    <div style="padding-top:30px; display:flex; flex-direction:column; gap:18px">
      <h1>Haftanın <span class="accent" style="font-style:italic">11'i</span></h1>
      <div class="hero">
        <div class="display">Bu haftanın en iyi 11'ini tahmin et!</div>
        <p class="muted">4-4-2 kadronu kur, kaptanını seç. Veri 11'ine ve Taraftar 11'ine giren her oyuncun puan kazandırır. Kaptan tutarsa 2 puan.</p>
      </div>
      <form id="join" class="card" style="display:flex; flex-direction:column; gap:12px">
        <label>Kullanıcı adın
          <input id="uname" maxlength="20" minlength="3" autocomplete="nickname" placeholder="ör. emre10" required>
        </label>
        <button class="btn big" type="submit">Başla</button>
        <p class="small muted">Şimdilik şifre yok: hesabın bu telefonda saklanır. Tarayıcı verilerini silersen hesabına tekrar ulaşamazsın.</p>
      </form>
    </div>`;
  document.getElementById('join').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('uname').value.trim();
    if (!/^[\p{L}0-9_.]{3,20}$/u.test(username)) return toast('3-20 karakter: harf, rakam, _ ya da .');
    const btn = e.submitter; btn.disabled = true;
    try {
      if (!hasSession) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        state.user = data.user;
      }
      const { error } = await sb.from('profiles').insert({ id: state.user.id, username });
      if (error) throw error.code === '23505' ? new Error('Bu kullanıcı adı alınmış') : error;
      await loadBase(); showTabs(); go('home');
    } catch (err) {
      toast(err.message || 'Bir sorun oldu'); btn.disabled = false;
    }
  };
}

function showTabs() {
  $tabs.hidden = false;
  $tabs.querySelector('[data-tab="admin"]').hidden = !state.profile?.is_admin;
  $tabs.querySelectorAll('.tab').forEach((b) => { b.onclick = () => go(b.dataset.tab); });
}
function go(tab) {
  state.tab = tab;
  $tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  window.scrollTo(0, 0);
  ({ home: renderHome, squad: renderSquad, table: renderTable, admin: renderAdmin })[tab]();
}

// ---------- Ana sayfa ----------
async function renderHome() {
  const ow = openWeek(), lw = lastClosedWeek();
  let mine = null, myScores = [], stats = [];
  if (ow) mine = (await sb.from('predictions').select('week_id').eq('week_id', ow.id).eq('user_id', state.user.id).maybeSingle()).data;
  if (lw) {
    myScores = (await sb.from('week_scores').select('source,points').eq('week_id', lw.id).eq('user_id', state.user.id)).data || [];
    stats = (await sb.from('pick_stats').select('player_id,picked_by,total_predictions').eq('week_id', lw.id).order('picked_by', { ascending: false }).limit(5)).data || [];
  }
  const score = (s) => myScores.find((x) => x.source === s)?.points;
  $app.innerHTML = `
    <div class="row between"><h1>Haftanın <span class="accent" style="font-style:italic">11'i</span></h1><span class="muted small">@${esc(state.profile.username)}</span></div>
    <div class="hero">
      <div class="display">${ow ? `${ow.id}. haftanın en iyi 11'ini tahmin et!` : 'Yeni hafta yakında açılacak'}</div>
      <p class="muted">${ow ? (mine ? 'Kadron kayıtlı. Kapanışa kadar istediğin kadar değiştirebilirsin.' : 'Henüz kadro kurmadın.') : 'Bir sonraki hafta açılınca burada göreceksin.'}</p>
      ${ow ? `<button class="btn" id="cta" style="align-self:flex-start">${mine ? 'Kadroma bak' : 'Kadronu oluştur'} →</button>` : ''}
    </div>
    ${ow ? `<div class="card row"><div class="grow"><div style="font-weight:700">${ow.id}. Hafta</div><div class="small muted">Kapanış: ${fmtDate(ow.deadline)}</div></div><span class="pill">${countdown(ow.deadline)}</span></div>` : ''}
    ${lw ? `
      <h2 style="margin-top:6px">${lw.id}. Hafta sonucun</h2>
      <div class="row" style="gap:10px">
        <div class="card grow"><div class="small muted">Veri 11'i</div><div class="display accent" style="font-size:34px">${score('veri') ?? '–'}</div></div>
        <div class="card grow"><div class="small muted">Taraftar 11'i</div><div class="display" style="font-size:34px">${score('taraftar') ?? '–'}</div></div>
      </div>
      ${stats.length ? `<h2 style="margin-top:6px">Çoğunluk ne dedi?</h2>
      <div class="card" style="display:flex; flex-direction:column; gap:10px">
        ${stats.map((s) => { const p = state.byId.get(s.player_id); const pct = Math.round((s.picked_by / s.total_predictions) * 100); return `<div class="row"><div style="width:120px" class="small"><b>${esc(p ? shortName(p.name) : '?')}</b></div><div class="bar"><span style="width:${pct}%"></span></div><div style="width:42px; text-align:right; font-weight:700">%${pct}</div></div>`; }).join('')}
      </div>` : ''}` : ''}
    <div class="lock"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3CC8FF" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Kimse kimsenin kadrosunu kapanıştan önce göremez.</div>`;
  const cta = document.getElementById('cta'); if (cta) cta.onclick = () => go('squad');
}

// ---------- Kadro ----------
async function renderSquad() {
  const w = currentWeek();
  if (!w) { $app.innerHTML = `<h1>Kadrom</h1><div class="card muted">Henüz açık bir hafta yok.</div>`; return; }
  const closed = isClosed(w);
  const { data: pred } = await sb.from('predictions').select('*').eq('week_id', w.id).eq('user_id', state.user.id).maybeSingle();
  if (!state.draft || state.draft.week !== w.id) {
    state.draft = { week: w.id, picks: pred ? pred.picks.slice() : Array(11).fill(null), captain: pred?.captain ?? null, dirty: false };
  }
  let tow = [];
  if (closed) tow = (await sb.from('team_of_week').select('source,player_id').eq('week_id', w.id)).data || [];
  const inTow = (id, src) => tow.some((t) => t.player_id === id && t.source === src);
  const d = state.draft;
  const filled = d.picks.filter(Boolean).length;

  const slot = (i) => {
    const p = d.picks[i] ? state.byId.get(d.picks[i]) : null;
    const hit = closed && p && inTow(p.id, state.source);
    return `<button class="slot ${p ? '' : 'empty'} ${closed && p && !hit ? 'miss' : ''}" data-i="${i}" aria-label="${p ? esc(p.name) + ', ' + esc(p.team) : ZONE_OF[i] + ' seç'}">
      <span class="shirt">${shirt(kitFor(p, i))}${p && d.captain === p.id ? '<span class="cap">C</span>' : ''}${hit ? '<span class="hit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#04111F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' : ''}</span>
      <span class="name">${p ? esc(shortName(p.name)) : '+ ' + ZONE_OF[i]}</span></button>`;
  };
  $app.innerHTML = `
    <div class="row between"><h1>Takımını Kur</h1><span class="pill">4 - 4 - 2</span></div>
    <div class="row between small muted"><span>${w.id}. Hafta · <b style="color:var(--text)">${filled}/11</b> seçildi</span><span>${closed ? 'Kapandı' : 'Kapanışa ' + countdown(w.deadline)}</span></div>
    ${closed && tow.length ? `<div class="seg" role="group" aria-label="Hangi 11"><button data-src="veri" aria-pressed="${state.source === 'veri'}">Veri 11'i</button><button data-src="taraftar" aria-pressed="${state.source === 'taraftar'}">Taraftar 11'i</button></div>` : ''}
    <div class="pitch">${LINES.map((l) => `<div class="line">${l.idx.map(slot).join('')}</div>`).join('')}</div>
    <p class="small muted" style="text-align:center">${closed ? (tow.length ? 'Yeşil tikli oyuncular 11\'e girdi.' : 'Haftanın 11\'i henüz açıklanmadı.') : '<span class="gold"><b>Kaptan (C) tutarsa 2 puan.</b></span> Oyuncuya dokun: seç, değiştir ya da kaptan yap.'}</p>
    ${closed ? '' : `<button class="btn big" id="save" ${filled === 11 && d.captain ? '' : 'disabled'}>${filled < 11 ? `${11 - filled} oyuncu daha seç` : !d.captain ? 'Kaptanını seç' : 'Kadroyu Kaydet'}</button>`}`;

  $app.querySelectorAll('[data-src]').forEach((b) => { b.onclick = () => { state.source = b.dataset.src; renderSquad(); }; });
  if (!closed) {
    $app.querySelectorAll('.slot').forEach((b) => { b.onclick = () => onSlot(+b.dataset.i); });
    document.getElementById('save').onclick = saveSquad;
  }
}

function onSlot(i) {
  const d = state.draft, id = d.picks[i];
  if (!id) return openPicker(i);
  const p = state.byId.get(id);
  openSheet(`
    <div class="row">${shirt(kitFor(p, i), 44)}<div class="grow"><div style="font-weight:700">${esc(p.name)}</div><div class="small muted">${esc(p.team)} · ${esc(p.position)}</div></div></div>
    <button class="btn" data-a="cap" ${d.captain === id ? 'disabled' : ''}>${d.captain === id ? 'Zaten kaptan' : 'Kaptan yap'}</button>
    <button class="btn subtle" data-a="swap">Değiştir</button>
    <button class="btn subtle" data-a="remove">Çıkar</button>`, (a) => {
    if (a === 'cap') d.captain = id;
    if (a === 'swap') { closeSheet(); return openPicker(i); }
    if (a === 'remove') { d.picks[i] = null; if (d.captain === id) d.captain = null; }
    d.dirty = true; closeSheet(); renderSquad();
  });
}

function openPicker(i) {
  const zone = ZONE_OF[i], d = state.draft;
  const pool = state.players.filter((p) => p.zone === zone);
  openSheet(`
    <div class="row between"><h2>${zone} seç</h2><button class="btn subtle" data-a="close" style="min-height:40px">Kapat</button></div>
    <input id="q" type="search" placeholder="Oyuncu ya da takım ara" autocomplete="off">
    <div class="scroll" id="res"></div>`, (a) => { if (a === 'close') closeSheet(); });
  const $res = document.getElementById('res'), $q = document.getElementById('q');
  const norm = (s) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const draw = () => {
    const q = norm($q.value.trim());
    const list = pool.filter((p) => !q || norm(p.name + ' ' + p.team).includes(q)).slice(0, 80);
    $res.innerHTML = list.map((p) => {
      const taken = d.picks.includes(p.id) && d.picks[i] !== p.id;
      return `<button class="pick" data-id="${p.id}" ${taken ? 'disabled' : ''}>${shirt(kitFor(p, i), 34)}<span class="grow"><b>${esc(p.name)}</b><br><span class="small muted">${esc(p.team)} · ${esc(p.position)}${p.number ? ' · ' + p.number : ''}</span></span>${taken ? '<span class="small muted">Kadroda</span>' : ''}</button>`;
    }).join('') || '<p class="muted center">Sonuç yok</p>';
    $res.querySelectorAll('.pick').forEach((b) => { b.onclick = () => {
      const old = d.picks[i]; d.picks[i] = +b.dataset.id;
      if (d.captain === old) d.captain = null;
      d.dirty = true; closeSheet(); renderSquad();
    }; });
  };
  $q.oninput = draw; draw();
}

async function saveSquad() {
  const d = state.draft, btn = document.getElementById('save');
  btn.disabled = true;
  const { error } = await sb.from('predictions').upsert({ user_id: state.user.id, week_id: d.week, picks: d.picks, captain: d.captain, updated_at: new Date().toISOString() });
  if (error) { toast(error.message.includes('row-level') ? 'Bu hafta kapandı, kadro değiştirilemez' : 'Kaydedilemedi: ' + error.message); btn.disabled = false; return; }
  d.dirty = false; toast('Kadron kaydedildi ✓'); renderSquad();
}

// ---------- Sıralama ----------
async function renderTable() {
  const { data } = await sb.from('leaderboard').select('*').eq('source', state.source).order('total', { ascending: false }).limit(200);
  const rows = data || [];
  let rank = 0, prev = null;
  const ranked = rows.map((r, i) => { if (r.total !== prev) { rank = i + 1; prev = r.total; } return { ...r, rank }; });
  $app.innerHTML = `
    <h1>Genel Sıralama</h1>
    <div class="seg" role="group" aria-label="Hangi 11"><button data-src="veri" aria-pressed="${state.source === 'veri'}">Veri 11'i</button><button data-src="taraftar" aria-pressed="${state.source === 'taraftar'}">Taraftar 11'i</button></div>
    <div class="card list" style="padding:6px">
      ${ranked.length ? ranked.map((r) => `<div class="item ${r.user_id === state.user.id ? 'me' : ''}"><span class="rank" ${r.rank <= 3 ? 'style="color:var(--gold)"' : ''}>${r.rank}</span><span class="grow" style="font-weight:700">${esc(r.username)}${r.user_id === state.user.id ? ' (sen)' : ''}</span><span class="small muted">son hafta ${r.last_week_points}</span><span class="pts">${r.total} P</span></div>`).join('') : '<p class="muted center">Puanlar ilk hafta kapanıp haftanın 11\'i girilince burada görünecek.</p>'}
    </div>`;
  $app.querySelectorAll('[data-src]').forEach((b) => { b.onclick = () => { state.source = b.dataset.src; renderTable(); }; });
}

// ---------- Yönetim (sadece yönetici) ----------
async function renderAdmin() {
  if (!state.profile?.is_admin) return go('home');
  const weeks = state.weeks.slice().sort((a, b) => b.id - a.id);
  const sel = state.adminWeek || weeks[0]?.id || '';
  const src = state.adminSource || 'veri';
  let tow = [];
  if (sel) tow = (await sb.from('team_of_week').select('player_id').eq('week_id', sel).eq('source', src)).data || [];
  state.adminPicks = tow.map((t) => t.player_id);
  const toLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  $app.innerHTML = `
    <h1>Yönetim</h1>
    <form id="wk" class="card" style="display:flex; flex-direction:column; gap:10px">
      <h2>Hafta aç / düzenle</h2>
      <div class="row"><label class="grow">Hafta no<input id="wid" type="number" min="1" max="60" required value="${sel || ''}"></label>
      <label class="grow">Kapanış (ilk maç)<input id="wdl" type="datetime-local" required value="${sel ? toLocal(state.weeks.find((w) => w.id === sel).deadline) : ''}"></label></div>
      <button class="btn" type="submit">Haftayı kaydet</button>
    </form>
    <div class="card" style="display:flex; flex-direction:column; gap:10px">
      <h2>Haftanın 11'ini gir</h2>
      <div class="row"><label class="grow">Hafta<select id="aw">${weeks.map((w) => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${w.id}. Hafta</option>`).join('')}</select></label>
      <label class="grow">Kaynak<select id="as"><option value="veri" ${src === 'veri' ? 'selected' : ''}>Veri 11'i</option><option value="taraftar" ${src === 'taraftar' ? 'selected' : ''}>Taraftar 11'i</option></select></label></div>
      <div id="chosen" style="display:flex; flex-direction:column; gap:4px"></div>
      <input id="aq" type="search" placeholder="Oyuncu ekle: isim ya da takım yaz" autocomplete="off">
      <div id="ares" class="list"></div>
      <button class="btn" id="asave">Bu 11'i kaydet</button>
    </div>`;

  document.getElementById('wk').onsubmit = async (e) => {
    e.preventDefault();
    const id = +document.getElementById('wid').value, deadline = new Date(document.getElementById('wdl').value).toISOString();
    const { error } = await sb.from('weeks').upsert({ id, deadline });
    if (error) return toast(error.message);
    state.adminWeek = id; await loadBase(); toast(`${id}. hafta kaydedildi`); renderAdmin();
  };
  document.getElementById('aw').onchange = (e) => { state.adminWeek = +e.target.value; renderAdmin(); };
  document.getElementById('as').onchange = (e) => { state.adminSource = e.target.value; renderAdmin(); };
  const norm = (s) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const drawChosen = () => {
    document.getElementById('chosen').innerHTML = `<div class="small muted">${state.adminPicks.length} oyuncu seçili</div>` + state.adminPicks.map((id) => { const p = state.byId.get(id); return `<div class="row card" style="padding:8px 12px"><span class="grow"><b>${esc(p?.name)}</b> <span class="small muted">${esc(p?.team)} · ${esc(p?.zone)}</span></span><button class="btn subtle" data-rm="${id}" style="min-height:36px; padding:0 12px">Çıkar</button></div>`; }).join('');
    document.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { state.adminPicks = state.adminPicks.filter((x) => x !== +b.dataset.rm); drawChosen(); }; });
  };
  const $aq = document.getElementById('aq'), $ares = document.getElementById('ares');
  $aq.oninput = () => {
    const q = norm($aq.value.trim());
    if (q.length < 2) { $ares.innerHTML = ''; return; }
    $ares.innerHTML = state.players.filter((p) => norm(p.name + ' ' + p.team).includes(q) && !state.adminPicks.includes(p.id)).slice(0, 8)
      .map((p) => `<button class="pick" data-add="${p.id}"><span class="grow"><b>${esc(p.name)}</b> <span class="small muted">${esc(p.team)} · ${esc(p.zone)}</span></span>+</button>`).join('');
    $ares.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { state.adminPicks.push(+b.dataset.add); $aq.value = ''; $ares.innerHTML = ''; drawChosen(); }; });
  };
  drawChosen();
  document.getElementById('asave').onclick = async () => {
    const week = +document.getElementById('aw').value, source = document.getElementById('as').value;
    if (!week) return toast('Önce bir hafta aç');
    const del = await sb.from('team_of_week').delete().eq('week_id', week).eq('source', source);
    if (del.error) return toast(del.error.message);
    if (state.adminPicks.length) {
      const ins = await sb.from('team_of_week').insert(state.adminPicks.map((player_id) => ({ week_id: week, source, player_id })));
      if (ins.error) return toast(ins.error.message);
    }
    toast('Kaydedildi, puanlar güncellendi ✓');
  };
}

// ---------- Alt pencere ----------
function openSheet(html, onAction) {
  $sheet.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  $sheet.hidden = false;
  $sheet.onclick = (e) => {
    if (e.target === $sheet) return closeSheet();
    const a = e.target.closest('[data-a]'); if (a && !a.disabled) onAction(a.dataset.a);
  };
  const first = $sheet.querySelector('input, button'); if (first) first.focus();
}
function closeSheet() { $sheet.hidden = true; $sheet.innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$sheet.hidden) closeSheet(); });

boot().catch((e) => { $app.innerHTML = `<div class="card">Bağlantı kurulamadı: ${esc(e.message)}</div>`; });
