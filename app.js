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
  await enterApp();
}

// Davet linkiyle gelindiyse (?lig=KOD) giriş yapınca lige katıl
const inviteParam = new URLSearchParams(location.search).get('lig');
if (inviteParam) { try { sessionStorage.setItem('pendingLeague', inviteParam.toUpperCase()); } catch {} history.replaceState(null, '', location.pathname); }

async function enterApp() {
  state.hasPass = (await sb.rpc('has_password')).data === true;
  showTabs();
  let pending = null; try { pending = sessionStorage.getItem('pendingLeague'); } catch {}
  if (pending) {
    try { sessionStorage.removeItem('pendingLeague'); } catch {}
    const { data, error } = await sb.rpc('join_league', { c: pending });
    if (!error) { state.league = data; toast('Lige katıldın ✓'); return go('table'); }
    toast(error.message);
  }
  go(state.tab);
}

async function loadBase() {
  const [pl, wk, mt, pr] = await Promise.all([
    sb.from('players').select('id,team,name,position,zone,number').eq('active', true).order('team').order('name').range(0, 1999),
    sb.from('weeks').select('*').order('id'),
    sb.from('matches').select('*').order('kickoff'),
    state.user ? sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle() : { data: null }
  ]);
  state.players = pl.data || [];
  state.byId = new Map(state.players.map((p) => [p.id, p]));
  state.weeks = wk.data || [];
  state.matches = mt.data || [];
  state.profile = pr.data || null;
}

function renderWelcome(hasSession = false, mode = 'new') {
  $tabs.hidden = true;
  const login = mode === 'login';
  let pending = null; try { pending = sessionStorage.getItem('pendingLeague'); } catch {}
  $app.innerHTML = `
    <div style="padding-top:30px; display:flex; flex-direction:column; gap:18px">
      <h1>Haftanın <span class="accent" style="font-style:italic">11'i</span></h1>
      <div class="hero">
        <div class="display">Bu haftanın en iyi 11'ini tahmin et!</div>
        <p class="muted">4-4-2 kadronu kur, kaptanını seç. Veri 11'ine ve Taraftar 11'ine giren her oyuncun puan kazandırır. Kaptan tutarsa 2 puan.</p>
      </div>
      ${pending ? '<div class="lock">Arkadaşının ligine davet edildin. Giriş yapınca otomatik katılacaksın.</div>' : ''}
      <form id="join" class="card" style="display:flex; flex-direction:column; gap:12px">
        <h2>${login ? 'Hesabına gir' : 'Yeni hesap'}</h2>
        <label>Kullanıcı adın
          <input id="uname" maxlength="20" minlength="3" autocomplete="username" placeholder="ör. emre10" required>
        </label>
        ${login ? `<label>Şifren<input id="upass" type="password" autocomplete="current-password" required></label>` : ''}
        <button class="btn big" type="submit">${login ? 'Giriş yap' : 'Başla'}</button>
        <p class="small muted">${login ? 'Şifreyi daha önce Profil sekmesinden belirlemiş olman gerekir.' : 'Girdikten sonra Profil sekmesinden şifre belirle; telefon değişse de hesabına girebilirsin.'}</p>
      </form>
      <button class="btn ghost" id="switch">${login ? 'Yeni hesap aç' : 'Zaten hesabım var, giriş yap'}</button>
    </div>`;
  document.getElementById('switch').onclick = () => renderWelcome(hasSession, login ? 'new' : 'login');
  document.getElementById('join').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('uname').value.trim();
    if (!/^[\p{L}0-9_.]{3,20}$/u.test(username)) return toast('3-20 karakter: harf, rakam, _ ya da .');
    const btn = e.submitter || e.target.querySelector('button'); btn.disabled = true;
    try {
      if (!state.user) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        state.user = data.user;
      }
      if (login) {
        const { data, error } = await sb.rpc('claim_account', { u: username, p: document.getElementById('upass').value });
        if (error) throw error;
        if (!data) throw new Error('Kullanıcı adı ya da şifre yanlış');
      } else {
        const { error } = await sb.from('profiles').insert({ id: state.user.id, username });
        if (error) throw error.code === '23505' ? new Error('Bu kullanıcı adı alınmış. Senin hesabınsa "giriş yap"ı kullan.') : error;
      }
      await loadBase();
      if (!state.profile) throw new Error('Profil yüklenemedi, sayfayı yenile');
      await enterApp();
      if (login) toast('Tekrar hoş geldin ✓');
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
  Promise.resolve(({ home: renderHome, squad: renderSquad, table: renderTable, profile: renderProfile, admin: renderAdmin })[tab]())
    .catch((e) => { console.error(e); $app.innerHTML = `<div class="card">Bir sorun oldu: ${esc(e.message)}<br><br><button class="btn" onclick="location.reload()">Yenile</button></div>`; });
}

// ---------- Haftanın maçları ----------
const opponentOf = (weekId, team) => { const m = (state.matches || []).find((x) => x.week_id === weekId && (x.home === team || x.away === team)); return m ? (m.home === team ? m.away : m.home + ' (dep.)') : null; };
function openFixtures(weekId) {
  const list = (state.matches || []).filter((m) => m.week_id === weekId);
  const days = new Map();
  list.forEach((m) => { const k = new Date(m.kickoff).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }); if (!days.has(k)) days.set(k, []); days.get(k).push(m); });
  const time = (d) => new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  openSheet(`
    <div class="row between"><h2>${weekId}. Hafta maçları</h2><button class="btn subtle" data-a="close" style="min-height:40px">Kapat</button></div>
    <div class="scroll" style="gap:14px">
      ${list.length ? [...days.entries()].map(([day, ms]) => `<div style="display:flex; flex-direction:column; gap:6px"><div class="small muted" style="font-weight:700; text-transform:capitalize">${day}</div>
        ${ms.map((m) => `<div class="match"><span class="team">${esc(m.home)}${shirt(KITS[m.home] || EMPTY_KIT, 26)}</span><span class="time">${time(m.kickoff)}</span><span class="team away">${shirt(KITS[m.away] || EMPTY_KIT, 26)}${esc(m.away)}</span></div>${m.stadium ? `<div class="small muted center" style="padding:0; margin-top:-4px">${esc(m.stadium)}</div>` : ''}`).join('')}</div>`).join('')
      : '<p class="muted center">Bu haftanın maç programı henüz girilmedi.</p>'}
    </div>`, (a) => { if (a === 'close') closeSheet(); });
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
    ${state.hasPass ? '' : `<button class="card row" id="protect" style="text-align:left; color:var(--text); font:inherit; cursor:pointer; border-color:var(--gold)"><span class="grow"><b class="gold">Hesabını koru</b><br><span class="small muted">Şifre belirle, telefon değişse de puanların kaybolmasın.</span></span><span class="gold">→</span></button>`}
    ${ow ? `<button class="card row" id="fixtures" style="text-align:left; color:var(--text); font:inherit; cursor:pointer; width:100%"><div class="grow"><div style="font-weight:700">${ow.id}. Hafta <span class="accent small">· Maçları gör →</span></div><div class="small muted">Kapanış: ${fmtDate(ow.deadline)}</div></div><span class="pill">${countdown(ow.deadline)}</span></button>` : ''}
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
  const pr = document.getElementById('protect'); if (pr) pr.onclick = () => go('profile');
  const fx = document.getElementById('fixtures'); if (fx) fx.onclick = () => openFixtures(ow.id);
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
    <div class="row between small muted"><span><button class="linkbtn" id="fx2">${w.id}. Hafta maçları</button> · <b style="color:var(--text)">${filled}/11</b> seçildi</span><span>${closed ? 'Kapandı' : 'Kapanışa ' + countdown(w.deadline)}</span></div>
    ${closed && tow.length ? `<div class="seg" role="group" aria-label="Hangi 11"><button data-src="veri" aria-pressed="${state.source === 'veri'}">Veri 11'i</button><button data-src="taraftar" aria-pressed="${state.source === 'taraftar'}">Taraftar 11'i</button></div>` : ''}
    <div class="pitch">${LINES.map((l) => `<div class="line">${l.idx.map(slot).join('')}</div>`).join('')}</div>
    <p class="small muted" style="text-align:center">${closed ? (tow.length ? 'Yeşil tikli oyuncular 11\'e girdi.' : 'Haftanın 11\'i henüz açıklanmadı.') : '<span class="gold"><b>Kaptan (C) tutarsa 2 puan.</b></span> Oyuncuya dokun: seç, değiştir ya da kaptan yap.'}</p>
    ${closed ? '' : `<button class="btn big" id="save" ${filled === 11 && d.captain ? '' : 'disabled'}>${filled < 11 ? `${11 - filled} oyuncu daha seç` : !d.captain ? 'Kaptanını seç' : d.dirty || !pred ? 'Kadroyu Kaydet' : 'Kadron kayıtlı ✓'}</button>`}
    ${pred && !d.dirty ? `<button class="btn ghost" id="share"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>Paylaşım kartı (story)</button>` : ''}`;

  $app.querySelectorAll('[data-src]').forEach((b) => { b.onclick = () => { state.source = b.dataset.src; renderSquad(); }; });
  if (!closed) {
    $app.querySelectorAll('.slot').forEach((b) => { b.onclick = () => onSlot(+b.dataset.i); });
    document.getElementById('save').onclick = saveSquad;
  }
  document.getElementById('fx2').onclick = () => openFixtures(w.id);
  const sh = document.getElementById('share');
  if (sh) sh.onclick = () => shareCard(w, d, closed && tow.length ? { tow, source: state.source } : null);
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
      return `<button class="pick" data-id="${p.id}" ${taken ? 'disabled' : ''}>${shirt(kitFor(p, i), 34)}<span class="grow"><b>${esc(p.name)}</b><br><span class="small muted">${esc(p.team)} · ${esc(p.position)}${p.number ? ' · ' + p.number : ''}</span>${opponentOf(d.week, p.team) ? `<br><span class="small accent">vs ${esc(opponentOf(d.week, p.team))}</span>` : ''}</span>${taken ? '<span class="small muted">Kadroda</span>' : ''}</button>`;
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

// ---------- Sıralama + özel ligler ----------
async function renderTable() {
  const leagues = (await sb.from('leagues').select('id,name,code,owner').order('created_at')).data || [];
  if (state.league && !leagues.some((l) => l.id === state.league)) state.league = null;
  const lg = leagues.find((l) => l.id === state.league) || null;
  let q = sb.from('leaderboard').select('*').eq('source', state.source).order('total', { ascending: false }).limit(500);
  let members = null;
  if (lg) {
    const ids = ((await sb.from('league_members').select('user_id').eq('league_id', lg.id)).data || []).map((m) => m.user_id);
    members = ((await sb.from('profiles').select('id,username').in('id', ids)).data || []);
    q = q.in('user_id', ids);
  }
  const { data } = await q;
  let rows = data || [];
  if (members) { // ligde puanı olmayanlar da 0 ile görünsün
    const has = new Set(rows.map((r) => r.user_id));
    rows = rows.concat(members.filter((m) => !has.has(m.id)).map((m) => ({ user_id: m.id, username: m.username, total: 0, last_week_points: 0 })));
  }
  let rank = 0, prev = null;
  const ranked = rows.map((r, i) => { if (r.total !== prev) { rank = i + 1; prev = r.total; } return { ...r, rank }; });
  $app.innerHTML = `
    <h1>${lg ? esc(lg.name) : 'Genel Sıralama'}</h1>
    <div class="chips" role="group" aria-label="Lig seç">
      <button data-lg="" aria-pressed="${!lg}">Genel</button>
      ${leagues.map((l) => `<button data-lg="${l.id}" aria-pressed="${lg?.id === l.id}">${esc(l.name)}</button>`).join('')}
      <button data-act="new">+ Lig kur</button><button data-act="join">Koda katıl</button>
    </div>
    ${lg ? `<div class="card row"><div class="grow"><div class="small muted">Davet kodu</div><div class="display accent" style="font-size:28px; letter-spacing:2px">${lg.code}</div></div><button class="btn" id="invite">Davet et</button></div>` : ''}
    <div class="seg" role="group" aria-label="Hangi 11"><button data-src="veri" aria-pressed="${state.source === 'veri'}">Veri 11'i</button><button data-src="taraftar" aria-pressed="${state.source === 'taraftar'}">Taraftar 11'i</button></div>
    <div class="card list" style="padding:6px">
      ${ranked.length ? ranked.map((r) => `<div class="item ${r.user_id === state.user.id ? 'me' : ''}"><span class="rank" ${r.rank <= 3 && r.total > 0 ? 'style="color:var(--gold)"' : ''}>${r.rank}</span><span class="grow" style="font-weight:700">${esc(r.username)}${r.user_id === state.user.id ? ' (sen)' : ''}</span><span class="small muted">son hafta ${r.last_week_points}</span><span class="pts">${r.total} P</span></div>`).join('') : '<p class="muted center">Puanlar ilk hafta kapanıp haftanın 11\'i girilince burada görünecek.</p>'}
    </div>
    ${lg ? `<button class="btn subtle" id="leave">Ligden ayrıl</button>` : ''}`;
  $app.querySelectorAll('[data-src]').forEach((b) => { b.onclick = () => { state.source = b.dataset.src; renderTable(); }; });
  $app.querySelectorAll('[data-lg]').forEach((b) => { b.onclick = () => { state.league = b.dataset.lg ? +b.dataset.lg : null; renderTable(); }; });
  $app.querySelector('[data-act="new"]').onclick = () => leagueForm('new');
  $app.querySelector('[data-act="join"]').onclick = () => leagueForm('join');
  const inv = document.getElementById('invite');
  if (inv) inv.onclick = () => {
    const url = `${location.origin}${location.pathname}?lig=${lg.code}`;
    const text = `"${lg.name}" ligine katıl! Haftanın 11'ini tahmin ediyoruz. Kod: ${lg.code}`;
    shareText(text, url);
  };
  const lv = document.getElementById('leave');
  if (lv) lv.onclick = async () => {
    if (!confirm(`"${lg.name}" liginden ayrılmak istiyor musun?`)) return;
    const { error } = await sb.from('league_members').delete().eq('league_id', lg.id).eq('user_id', state.user.id);
    if (error) return toast(error.message);
    state.league = null; toast('Ligden ayrıldın'); renderTable();
  };
}

function leagueForm(kind) {
  const isNew = kind === 'new';
  openSheet(`
    <h2>${isNew ? 'Arkadaş ligi kur' : 'Koda katıl'}</h2>
    <p class="small muted">${isNew ? 'Ligi kur, sana verilen kodu ya da davet linkini arkadaşlarına gönder.' : 'Arkadaşının gönderdiği 6 harfli kodu yaz.'}</p>
    <input id="lgv" maxlength="${isNew ? 30 : 6}" placeholder="${isNew ? 'ör. Duka Ligi' : 'ör. K7M2QX'}" ${isNew ? '' : 'style="text-transform:uppercase; letter-spacing:2px"'} autocomplete="off">
    <button class="btn" data-a="ok">${isNew ? 'Ligi kur' : 'Katıl'}</button>
    <button class="btn subtle" data-a="close">Vazgeç</button>`, async (a) => {
    if (a === 'close') return closeSheet();
    const v = document.getElementById('lgv').value.trim();
    const { data, error } = isNew ? await sb.rpc('create_league', { n: v }) : await sb.rpc('join_league', { c: v });
    if (error) return toast(error.message);
    closeSheet();
    if (isNew) {
      const l = (await sb.from('leagues').select('id').eq('code', data).maybeSingle()).data;
      state.league = l?.id || null; toast('Lig kuruldu ✓ Şimdi arkadaşlarını davet et');
    } else { state.league = data; toast('Lige katıldın ✓'); }
    renderTable();
  });
}

async function shareText(text, url) {
  try {
    if (navigator.share) { await navigator.share({ text, url }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Davet linki kopyalandı'); }
  catch { prompt('Bu metni kopyala:', `${text} ${url}`); }
}

// ---------- Profil: şifre, sezon, mevki, rozetler ----------
const BADGES = [
  { id: 'first', icon: '⚽', name: 'İlk Adım', desc: 'İlk kadronu kurdun' },
  { id: 'oracle', icon: '🔮', name: 'Kâhin', desc: 'Bir haftada 11/11 bildin' },
  { id: 'sniper', icon: '🎯', name: 'Keskin Nişancı', desc: 'Bir haftada en az 7 oyuncu bildin' },
  { id: 'keeper', icon: '🧤', name: 'Kaleci Bilen', desc: 'Haftanın kalecisini bildin' },
  { id: 'striker', icon: '🔥', name: 'Golcü Avcısı', desc: 'İki forveti de bildin' },
  { id: 'wall', icon: '🧱', name: 'Duvar Ustası', desc: 'Dört defansı da bildin' },
  { id: 'brain', icon: '🧠', name: 'Orta Saha Beyni', desc: 'Dört orta sahayı da bildin' },
  { id: 'captain', icon: '©️', name: 'Kaptan Bilgesi', desc: 'Kaptanın 3 kez 11\'e girdi' },
  { id: 'regular', icon: '📅', name: 'Müdavim', desc: '5 hafta oynadın' }
];

async function computeStats() {
  const preds = (await sb.from('predictions').select('week_id,picks,captain').eq('user_id', state.user.id)).data || [];
  const closedIds = state.weeks.filter(isClosed).map((w) => w.id);
  const tow = closedIds.length ? ((await sb.from('team_of_week').select('week_id,source,player_id').in('week_id', closedIds)).data || []) : [];
  const set = (w, s) => new Set(tow.filter((t) => t.week_id === w && t.source === s).map((t) => t.player_id));
  const per = { veri: [], taraftar: [] };
  for (const p of preds) {
    if (!closedIds.includes(p.week_id)) continue;
    for (const s of ['veri', 'taraftar']) {
      const st = set(p.week_id, s); if (!st.size) continue;
      const hitIdx = p.picks.map((id, i) => (st.has(id) ? i : -1)).filter((i) => i >= 0);
      const capHit = st.has(p.captain);
      per[s].push({ week: p.week_id, picks: p.picks, hitIdx, hits: hitIdx.length, capHit, points: hitIdx.length + (capHit ? 1 : 0) });
    }
  }
  const earned = {};
  const add = (id) => { earned[id] = (earned[id] || 0) + 1; };
  if (preds.length) add('first');
  const all = per.veri.concat(per.taraftar);
  for (const r of all) {
    const has = (idx) => idx.every((i) => r.hitIdx.includes(i));
    if (r.hits === 11) add('oracle');
    if (r.hits >= 7) add('sniper');
    if (has([0])) add('keeper');
    if (has([9, 10])) add('striker');
    if (has([1, 2, 3, 4])) add('wall');
    if (has([5, 6, 7, 8])) add('brain');
  }
  const capWeeks = new Set(all.filter((r) => r.capHit).map((r) => r.week)).size;
  if (capWeeks >= 3) earned.captain = Math.floor(capWeeks / 3);
  const played = new Set(all.map((r) => r.week)).size;
  if (played >= 5) earned.regular = Math.floor(played / 5);
  const pickCount = new Map();
  preds.forEach((p) => p.picks.forEach((id) => pickCount.set(id, (pickCount.get(id) || 0) + 1)));
  const fav = [...pickCount.entries()].sort((a, b) => b[1] - a[1])[0];
  return { per, earned, fav, predCount: preds.length };
}

async function renderProfile() {
  const st = await computeStats();
  const rows = st.per[state.source];
  const total = rows.reduce((a, r) => a + r.points, 0);
  const best = rows.slice().sort((a, b) => b.points - a.points)[0];
  const capRate = rows.length ? Math.round((rows.filter((r) => r.capHit).length / rows.length) * 100) : null;
  // Mevki bilme: detaylı mevkiye göre kaç kere bildin, bölgeye göre bildiğin / seçtiğin
  const posHits = new Map(), zone = { Kaleci: [0, 0], Defans: [0, 0], 'Orta Saha': [0, 0], Forvet: [0, 0] };
  for (const r of rows) r.picks.forEach((id, i) => {
    const z = ZONE_OF[i]; zone[z][1]++;
    if (r.hitIdx.includes(i)) { zone[z][0]++; const pos = state.byId.get(id)?.position || z; posHits.set(pos, (posHits.get(pos) || 0) + 1); }
  });
  const posText = [...posHits.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${n} kere ${p.toLocaleLowerCase('tr')}`).join(', ');
  const never = Object.entries(zone).filter(([, v]) => v[1] > 0 && v[0] === 0).map(([z]) => z.toLocaleLowerCase('tr'));
  const favP = st.fav ? state.byId.get(st.fav[0]) : null;
  const stat = (label, value) => `<div class="card grow" style="padding:12px"><div class="small muted">${label}</div><div class="display" style="font-size:28px">${value}</div></div>`;

  $app.innerHTML = `
    <div class="row between"><h1>@${esc(state.profile.username)}</h1>${state.profile.is_admin ? '<span class="pill">Yönetici</span>' : ''}</div>
    <div class="card" style="display:flex; flex-direction:column; gap:10px; ${state.hasPass ? '' : 'border-color:var(--gold)'}">
      <div class="row between"><b>${state.hasPass ? 'Hesabın korunuyor ✓' : '<span class="gold">Hesabını koru</span>'}</b>${state.hasPass ? '<button class="btn subtle" id="chpass" style="min-height:36px; padding:0 14px">Şifreyi değiştir</button>' : ''}</div>
      <p class="small muted">${state.hasPass ? 'Başka bir telefondan girişte "Zaten hesabım var" deyip kullanıcı adın ve şifrenle girersin.' : 'Şu an hesabın sadece bu tarayıcıda. Şifre belirlersen telefon değişse ya da tarayıcı temizlense bile kullanıcı adın + şifrenle geri girersin.'}</p>
      ${state.hasPass ? '' : '<input id="np" type="password" minlength="6" autocomplete="new-password" placeholder="En az 6 karakter"><button class="btn" id="setpass">Şifreyi kaydet</button>'}
    </div>

    <h2 style="margin-top:6px">Sezon istatistiklerin</h2>
    <div class="seg" role="group" aria-label="Hangi 11"><button data-src="veri" aria-pressed="${state.source === 'veri'}">Veri 11'i</button><button data-src="taraftar" aria-pressed="${state.source === 'taraftar'}">Taraftar 11'i</button></div>
    <div class="row" style="gap:10px">${stat('Toplam puan', total)}${stat('Oynanan hafta', rows.length)}</div>
    <div class="row" style="gap:10px">${stat('Ortalama', rows.length ? (total / rows.length).toFixed(1) : '–')}${stat('En iyi hafta', best ? `${best.points} P <span class="small muted" style="font-family:Inter; font-weight:500">(${best.week}.)</span>` : '–')}</div>
    <div class="row" style="gap:10px">${stat('Kaptan tutma', capRate === null ? '–' : '%' + capRate)}${stat('En çok seçtiğin', favP ? `<span style="font-size:18px">${esc(shortName(favP.name))}</span>` : '–')}</div>

    <h2 style="margin-top:6px">Hangi mevkileri bildin?</h2>
    <div class="card" style="display:flex; flex-direction:column; gap:10px">
      ${rows.length ? `<p>${posText ? `Şu ana kadar <b>${esc(posText)}</b> bildin.` : 'Henüz hiç oyuncu bilemedin.'}${never.length ? ` Hiç <b class="gold">${never.join(', ')}</b> bilemedin.` : ''}</p>
      ${Object.entries(zone).map(([z, [h, n]]) => `<div class="row"><div style="width:84px" class="small"><b>${z}</b></div><div class="bar"><span style="width:${n ? Math.round((h / n) * 100) : 0}%"></span></div><div style="width:56px; text-align:right" class="small">${h}/${n}</div></div>`).join('')}` : '<p class="muted small">İlk hafta kapanıp haftanın 11\'i girilince burada görünecek.</p>'}
    </div>

    <h2 style="margin-top:6px">Rozetler <span class="small muted" style="font-family:Inter">${Object.keys(st.earned).length}/${BADGES.length}</span></h2>
    <div class="badges">
      ${BADGES.map((b) => { const n = st.earned[b.id]; return `<div class="badge ${n ? 'on' : ''}"><div class="ico">${b.icon}</div><b>${b.name}</b><span class="small muted">${b.desc}</span>${n > 1 ? `<span class="pill solid" style="font-size:11px; padding:2px 8px">×${n}</span>` : ''}</div>`; }).join('')}
    </div>`;

  $app.querySelectorAll('[data-src]').forEach((b) => { b.onclick = () => { state.source = b.dataset.src; renderProfile(); }; });
  const sp = document.getElementById('setpass');
  if (sp) sp.onclick = () => savePassword(document.getElementById('np').value);
  const cp = document.getElementById('chpass');
  if (cp) cp.onclick = () => openSheet(`<h2>Yeni şifre</h2><input id="np2" type="password" minlength="6" autocomplete="new-password" placeholder="En az 6 karakter"><button class="btn" data-a="ok">Kaydet</button><button class="btn subtle" data-a="close">Vazgeç</button>`,
    async (a) => { if (a === 'close') return closeSheet(); if (await savePassword(document.getElementById('np2').value)) closeSheet(); });
}

async function savePassword(p) {
  if ((p || '').length < 6) { toast('Şifre en az 6 karakter olmalı'); return false; }
  const { error } = await sb.rpc('set_password', { p });
  if (error) { toast(error.message); return false; }
  state.hasPass = true; toast('Şifren kaydedildi ✓'); renderProfile(); return true;
}

// ---------- Paylaşım kartı (1080×1920 story) ----------
async function shareCard(w, d, result) {
  toast('Kart hazırlanıyor…');
  try { await Promise.all([document.fonts.load('italic 800 100px Barlow'), document.fonts.load('800 40px Barlow'), document.fonts.load('700 30px Inter'), document.fonts.load('500 30px Inter')]); } catch {}
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rr = (X, Y, w2, h2, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w2, Y, X + w2, Y + h2, r); x.arcTo(X + w2, Y + h2, X, Y + h2, r); x.arcTo(X, Y + h2, X, Y, r); x.arcTo(X, Y, X + w2, Y, r); x.closePath(); };
  // Arka plan
  x.fillStyle = '#07101F'; x.fillRect(0, 0, W, H);
  let g = x.createRadialGradient(W, 0, 50, W, 0, 1100); g.addColorStop(0, 'rgba(60,200,255,.28)'); g.addColorStop(1, 'rgba(60,200,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // Başlık
  x.textBaseline = 'alphabetic'; x.fillStyle = '#EEF4FF'; x.font = 'italic 800 120px Barlow, sans-serif';
  x.fillText('Haftanın', 70, 210); const tw = x.measureText('Haftanın ').width;
  x.fillStyle = '#3CC8FF'; x.fillText("11'i", 70 + tw, 210);
  x.fillStyle = '#A9B8D0'; x.font = '600 40px Inter, sans-serif';
  x.fillText(`${w.id}. Hafta  ·  @${state.profile.username}`, 74, 285);
  // Sonuç rozeti
  const inSet = result ? new Set(result.tow.filter((t) => t.source === result.source).map((t) => t.player_id)) : null;
  if (inSet) {
    const pts = d.picks.filter((id) => inSet.has(id)).length + (inSet.has(d.captain) ? 1 : 0);
    const label = `${result.source === 'veri' ? 'Veri' : 'Taraftar'} 11'i: ${pts} P`;
    x.font = '800 46px Barlow, sans-serif'; const lw = x.measureText(label).width + 60;
    rr(W - 70 - lw, 240, lw, 70, 35); x.fillStyle = '#3CC8FF'; x.fill(); x.fillStyle = '#04111F'; x.fillText(label, W - 70 - lw + 30, 292);
  }
  // Saha
  const PX = 50, PY = 350, PW = W - 100, PH = 1330;
  rr(PX, PY, PW, PH, 44); g = x.createLinearGradient(0, PY, 0, PY + PH); g.addColorStop(0, '#0E2A4D'); g.addColorStop(1, '#0B1F3A'); x.fillStyle = g; x.fill();
  x.lineWidth = 3; x.strokeStyle = '#2A6FB0'; x.stroke();
  x.globalAlpha = .7; x.beginPath(); x.moveTo(PX, PY + PH / 2); x.lineTo(PX + PW, PY + PH / 2); x.stroke();
  x.beginPath(); x.arc(W / 2, PY + PH / 2, 120, 0, Math.PI * 2); x.stroke();
  x.strokeRect(W / 2 - 220, PY, 440, 150); x.strokeRect(W / 2 - 220, PY + PH - 150, 440, 150); x.globalAlpha = 1;
  const shirtPath = new Path2D('M21 5 Q30 10 39 5 L44 7 L56 15 L51 26 L45 23 L45 56 L15 56 L15 23 L9 26 L4 15 L16 7 Z');
  const rowsY = [PY + 120, PY + 430, PY + 760, PY + 1060];
  LINES.forEach((l, li) => {
    l.idx.forEach((i, k) => {
      const cx = PX + (PW / (l.idx.length + 1)) * (k + 1), cy = rowsY[li];
      const p = state.byId.get(d.picks[i]); const S = 150, sc = S / 60;
      const miss = inSet && p && !inSet.has(p.id);
      x.save(); x.globalAlpha = miss ? .45 : 1; x.translate(cx - S / 2, cy); x.scale(sc, sc); x.clip(shirtPath);
      kitFor(p, i).forEach((col, j) => { x.fillStyle = col; x.fillRect(j * 10, 0, 10, 60); });
      x.restore();
      x.save(); x.translate(cx - S / 2, cy); x.scale(sc, sc); x.lineWidth = 1.2; x.strokeStyle = 'rgba(255,255,255,.45)'; x.stroke(shirtPath); x.restore();
      if (p && d.captain === p.id) { x.beginPath(); x.arc(cx + 62, cy + 18, 30, 0, Math.PI * 2); x.fillStyle = '#FFC93C'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#07101F'; x.stroke(); x.fillStyle = '#04111F'; x.font = '800 36px Barlow, sans-serif'; x.textAlign = 'center'; x.fillText('C', cx + 62, cy + 31); x.textAlign = 'left'; }
      if (inSet && p && inSet.has(p.id)) { x.beginPath(); x.arc(cx - 62, cy + 18, 28, 0, Math.PI * 2); x.fillStyle = '#7CE38B'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#07101F'; x.stroke(); x.beginPath(); x.moveTo(cx - 75, cy + 19); x.lineTo(cx - 65, cy + 29); x.lineTo(cx - 49, cy + 8); x.lineWidth = 7; x.strokeStyle = '#04111F'; x.lineCap = 'round'; x.stroke(); x.lineCap = 'butt'; }
      // İsim
      x.font = `700 ${l.idx.length === 4 ? 26 : 30}px Inter, sans-serif`;
      let name = p ? shortName(p.name) : '–';
      const maxW = l.idx.length === 4 ? 172 : 240;
      while (x.measureText(name).width > maxW && name.length > 3) name = name.slice(0, -2) + '…';
      const nw = x.measureText(name).width + 36;
      rr(cx - nw / 2, cy + S + 14, nw, 52, 26); x.fillStyle = '#0A1528'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#2A6FB0'; x.stroke();
      x.fillStyle = '#EEF4FF'; x.textAlign = 'center'; x.fillText(name, cx, cy + S + 51); x.textAlign = 'left';
    });
  });
  // Alt yazı
  x.textAlign = 'center'; x.fillStyle = '#EEF4FF'; x.font = '800 54px Barlow, sans-serif';
  x.fillText(inSet ? 'Sen kaç tane bilirdin?' : 'Sen olsan kimi seçerdin?', W / 2, 1775);
  x.fillStyle = '#3CC8FF'; x.font = '600 36px Inter, sans-serif';
  x.fillText('cardelest.github.io/Week-11', W / 2, 1835); x.textAlign = 'left';

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], `haftanin-11i-${w.id}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `Haftanın 11'i · ${w.id}. hafta kadrom` }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob);
  openSheet(`<h2>Paylaşım kartın</h2><img src="${url}" alt="Haftanın 11'i paylaşım kartı" style="width:100%; max-height:55vh; object-fit:contain; border-radius:14px"><a class="btn" href="${url}" download="${file.name}">Görseli indir</a><button class="btn subtle" data-a="close">Kapat</button>`, (a) => { if (a === 'close') closeSheet(); });
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
