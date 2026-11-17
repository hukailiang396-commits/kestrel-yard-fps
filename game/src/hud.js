// The DOM HUD: health, ammo, money, timer, score, alive counts, kill feed, crosshair,
// hitmarker, buy menu, plant/defuse bar, round banner and the scoreboard. It never touches
// the simulation; main.js pushes numbers in and reads the play callback out. Every setter
// skips work when the value did not change, so the HUD costs nothing most frames.
import { BUY_MENU } from './weapons.js';

const COPY = {
  start: {
    title: 'KESTREL',
    copy: 'Kestrel Yard — a decommissioned desert relay station at dusk. Vanguard plants the charge at Site A or Site B; Sentinel holds the yard. First to 8 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'KESTREL',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team fights on. Watch the round play out.',
    action: 'Keep watching',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    healthNum: $('health-num'),
    healthFill: $('health-fill'),
    money: $('money'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammoBox: $('ammo'),
    grenade: $('grenade'),
    timer: $('timer'),
    roundLabel: $('round-label'),
    scoreV: $('score-v'),
    scoreS: $('score-s'),
    aliveV: $('alive-v'),
    aliveS: $('alive-s'),
    feed: $('feed'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buyMenu: $('buy-menu'),
    buyList: $('buy-list'),
    buyMoney: $('buy-money'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    scoreboard: $('scoreboard'),
    scoreRows: $('score-rows'),
    scoreTitle: $('score-title'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    playAgain: $('play-again'),
    charge: $('charge'),
    damage: $('damage'),
  };
  let hitTimer = 0;
  let damageTimer = 0;
  const last = {};

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  // Build the buy menu once from the shared table in weapons.js.
  for (const item of BUY_MENU) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.label}</span><span class="buy-note">${item.note}</span><span class="buy-price">$${item.price}</span>`;
    els.buyList.appendChild(row);
  }

  return {
    setHealth(hp) {
      setText(els.healthNum, 'hp', String(Math.max(0, Math.ceil(hp))));
      const pct = Math.max(0, Math.min(100, hp));
      if (last.hpPct !== pct) {
        last.hpPct = pct;
        els.healthFill.style.width = `${pct}%`;
        els.healthFill.classList.toggle('low', pct <= 30);
      }
    },
    setMoney(value) {
      setText(els.money, 'money', `$${value}`);
      setText(els.buyMoney, 'buyMoney', `$${value}`);
    },
    setAmmo(mag, reserve) {
      setText(els.ammoMag, 'mag', String(mag));
      setText(els.ammoReserve, 'reserve', `/ ${reserve}`);
      els.ammoBox.classList.toggle('empty', mag === 0);
    },
    setGrenade(type, count, armed) {
      const label = armed ? `${type.toUpperCase()} ×${count} — click to throw` : count > 0 ? `${type.toUpperCase()} ×${count} (G)` : '';
      setText(els.grenade, 'grenade', label);
      els.grenade.classList.toggle('armed', armed);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      setText(els.timer, 'timer', `${mm}:${ss}`);
      setText(els.roundLabel, 'phase', phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? 'ROUND' : phase === 'over' ? 'ROUND OVER' : 'MATCH OVER');
      els.timer.classList.toggle('urgent', phase === 'live' && s <= 10);
    },
    setScore(v, s) {
      setText(els.scoreV, 'scoreV', String(v));
      setText(els.scoreS, 'scoreS', String(s));
    },
    setAlive(v, s) {
      setText(els.aliveV, 'aliveV', `Vanguard ${v} alive`);
      setText(els.aliveS, 'aliveS', `Sentinel ${s} alive`);
    },
    setFeed(feed) {
      const html = feed.map((f) => `<div class="feed-row ${f.team ?? ''}">${f.text}</div>`).join('');
      if (last.feedHtml !== html) {
        last.feedHtml = html;
        els.feed.innerHTML = html;
      }
    },
    setCrosshair(spreadPx) {
      const px = Math.round(spreadPx);
      if (last.gap === px) return;
      last.gap = px;
      els.crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    flashDamage() {
      els.damage.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => els.damage.classList.remove('on'), 180);
    },
    showBanner(title, sub) {
      setText(els.bannerTitle, 'bannerTitle', title);
      setText(els.bannerSub, 'bannerSub', sub);
      els.banner.hidden = false;
    },
    hideBanner() {
      els.banner.hidden = true;
    },
    showBuy(open) {
      els.buyMenu.hidden = !open;
    },
    setPlant(frac, label) {
      if (frac <= 0) {
        els.plantBar.hidden = true;
        return;
      }
      els.plantBar.hidden = false;
      els.plantFill.style.width = `${Math.round(frac * 100)}%`;
      setText(els.plantLabel, 'plantLabel', label);
    },
    setCharge(text) {
      setText(els.charge, 'charge', text);
    },
    showScoreboard(rows, title) {
      setText(els.scoreTitle, 'scoreTitle', title);
      els.scoreRows.innerHTML = rows.map((r) => (
        `<div class="score-row ${r.team}"><span class="score-name">${r.name}</span><span>${r.kills} K</span><span>${r.deaths} D</span><span>${r.alive ? 'ALIVE' : 'DOWN'}</span></div>`
      )).join('');
      els.scoreboard.hidden = false;
    },
    hideScoreboard() {
      els.scoreboard.hidden = true;
    },
    showPlayAgain(show) {
      els.playAgain.hidden = !show;
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      els.overlayTitle.textContent = text.title;
      els.overlayCopy.textContent = mode === 'match' ? extra : text.copy;
      els.play.textContent = text.action;
      els.overlay.hidden = false;
      els.play.focus();
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
      els.playAgain.addEventListener('click', handler);
    },
  };
}
