import { saveDraft, state } from './store';
import { fmtClock, h } from './util';

/**
 * Timer przerwy oparty o znacznik czasu końca (draft.restEndsAt), więc liczy
 * poprawnie po wygaszeniu ekranu i po ponownym otwarciu aplikacji.
 */
let el: HTMLElement;
let timeEl: HTMLElement;
let labelEl: HTMLElement;
let fillEl: HTMLElement;
let addBtn: HTMLButtonElement;
let skipBtn: HTMLButtonElement;
let interval: ReturnType<typeof setInterval> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let audio: AudioContext | null = null;

export function initRest() {
  el = document.getElementById('rest')!;
  timeEl = h('span', { class: 'rest-time num' }, '0:00');
  labelEl = h('span', { class: 'rest-label' }, 'Przerwa');
  fillEl = h('div', { class: 'rest-fill' });
  addBtn = h('button', { class: 'rest-btn', onclick: () => addRest(30) }, '+30 s');
  skipBtn = h('button', { class: 'rest-btn', onclick: () => skipRest() }, 'Pomiń');
  el.append(
    h('div', { class: 'rest-track' }, fillEl),
    h('div', { class: 'rest-row' }, h('div', { class: 'rest-info' }, labelEl, timeEl), addBtn, skipBtn),
  );
  el.dataset.state = 'closed';
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncRest(true);
  });
  syncRest(true);
}

/** Odblokowanie dźwięku na iOS musi nastąpić w geście użytkownika (np. tapnięcie ✓). */
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* brak audio */
  }
}

function beep() {
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  for (const [offset, freq] of [
    [0, 880],
    [0.18, 1175],
  ] as const) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.16);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.18);
  }
}

export function startRest(seconds = state.settings.restSeconds) {
  const d = state.draft;
  if (!d) return;
  d.restEndsAt = Date.now() + seconds * 1000;
  d.restTotal = seconds;
  saveDraft();
  syncRest();
}

export function addRest(seconds: number) {
  const d = state.draft;
  if (!d) return;
  const base = d.restEndsAt && d.restEndsAt > Date.now() ? d.restEndsAt : Date.now();
  d.restEndsAt = base + seconds * 1000;
  d.restTotal = Math.max(d.restTotal, Math.ceil((d.restEndsAt - Date.now()) / 1000));
  saveDraft();
  syncRest();
}

export function skipRest() {
  const d = state.draft;
  if (d) {
    d.restEndsAt = null;
    saveDraft();
  }
  hide();
}

/** Uzgadnia pasek ze stanem szkicu. `resumed`: po powrocie do aplikacji nie wibruj za stare przerwy. */
export function syncRest(resumed = false) {
  const d = state.draft;
  if (!d || !d.restEndsAt) {
    if (el.dataset.state === 'open') hide();
    return;
  }
  const left = (d.restEndsAt - Date.now()) / 1000;
  if (left <= 0) {
    d.restEndsAt = null;
    saveDraft();
    // Przerwa skończyła się dawno temu (aplikacja była zamknięta): po prostu schowaj.
    if (resumed && left < -30) return hide();
    return finish();
  }
  show();
  clearInterval(interval);
  interval = setInterval(tick, 250);
  tick();
}

function tick() {
  const d = state.draft;
  if (!d || !d.restEndsAt) return;
  const left = (d.restEndsAt - Date.now()) / 1000;
  if (left <= 0) {
    d.restEndsAt = null;
    saveDraft();
    finish();
    return;
  }
  timeEl.textContent = fmtClock(Math.ceil(left));
  fillEl.style.transform = `scaleX(${Math.min(1, left / Math.max(1, d.restTotal))})`;
}

function show() {
  clearTimeout(hideTimer);
  el.hidden = false;
  el.classList.remove('is-done');
  labelEl.textContent = 'Przerwa';
  addBtn.hidden = false;
  skipBtn.textContent = 'Pomiń';
  skipBtn.onclick = () => skipRest();
  document.body.classList.add('has-rest');
  if (el.dataset.state !== 'open') {
    void el.offsetHeight;
    el.dataset.state = 'open';
  }
}

function finish() {
  clearInterval(interval);
  show();
  el.classList.add('is-done');
  labelEl.textContent = 'Koniec przerwy';
  timeEl.textContent = '0:00';
  fillEl.style.transform = 'scaleX(0)';
  addBtn.hidden = true;
  skipBtn.textContent = 'OK';
  skipBtn.onclick = () => hide();
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* iOS nie wspiera wibracji z przeglądarki */
  }
  beep();
  hideTimer = setTimeout(hide, 6000);
}

function hide() {
  clearInterval(interval);
  clearTimeout(hideTimer);
  if (el.dataset.state !== 'open') return;
  el.dataset.state = 'closing';
  document.body.classList.remove('has-rest');
  const done = () => {
    if (el.dataset.state === 'closing') {
      el.hidden = true;
      el.dataset.state = 'closed';
    }
  };
  setTimeout(done, 260);
}
