import './styles.css';
import { app, type Tab } from './app';
import { initRest, syncRest } from './rest';
import { events, flushDraft, load, state } from './store';
import { toast } from './ui/toast';
import { h, icon, reducedMotion } from './util';
import { renderHistory } from './views/history';
import { renderPlan } from './views/plan';
import { renderProgress } from './views/progress';
import { renderTraining } from './views/workout';

const TABS: { id: Tab; label: string; icon: string; render: (root: HTMLElement) => void }[] = [
  { id: 'trening', label: 'Trening', icon: 'dumbbell', render: renderTraining },
  { id: 'historia', label: 'Historia', icon: 'history', render: renderHistory },
  { id: 'progres', label: 'Progres', icon: 'chart', render: renderProgress },
  { id: 'plan', label: 'Plan', icon: 'list', render: renderPlan },
];

const main = document.getElementById('main')!;
const nav = document.getElementById('nav')!;
const scrollPos = new Map<Tab, number>();
const navButtons = new Map<Tab, HTMLButtonElement>();

function render(scrollTop: number) {
  const tab = TABS.find((t) => t.id === app.tab)!;
  const page = h('div', { class: 'page', dataset: { tab: tab.id } });
  tab.render(page);
  main.replaceChildren(page);
  main.scrollTop = scrollTop;
  for (const [id, btn] of navButtons) {
    const active = id === app.tab;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  navButtons.get('trening')!.classList.toggle('has-dot', !!state.draft);
}

// Przełączanie zakładek bez animacji: robi się to wiele razy na trening.
app.go = (tab, opts) => {
  scrollPos.set(app.tab, main.scrollTop);
  app.tab = tab;
  render(opts?.top ? 0 : (scrollPos.get(tab) ?? 0));
};
app.rerender = () => render(main.scrollTop);

function buildNav() {
  for (const t of TABS) {
    const btn = h(
      'button',
      {
        class: 'nav-btn',
        onclick: () => {
          if (app.tab === t.id) {
            // Ponowne tapnięcie aktywnej zakładki: na górę (jak w iOS).
            main.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
            return;
          }
          app.go(t.id);
        },
      },
      h('span', { class: 'nav-icon' }, icon(t.icon, 24), h('span', { class: 'nav-dot', 'aria-hidden': 'true' })),
      h('span', { class: 'nav-label' }, t.label),
    );
    navButtons.set(t.id, btn);
    nav.append(btn);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const hadController = !!navigator.serviceWorker.controller;
  let notified = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Pierwsza instalacja też zmienia kontroler; komunikat tylko przy aktualizacji.
    if (!hadController || notified) return;
    notified = true;
    toast('Nowa wersja – zamknij i otwórz aplikację ponownie', {
      persistent: true,
      // Nigdy nie przeładowujemy sami; w trakcie treningu nie proponujemy nawet przycisku.
      action: state.draft ? undefined : { label: 'Odśwież', onClick: () => location.reload() },
    });
  });
  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void reg.update().catch(() => {});
      });
    })
    .catch((err) => console.warn('Service worker:', err));
}

async function start() {
  buildNav();
  events.addEventListener('error', () => toast('Nie udało się zapisać danych na telefonie.', { tone: 'error' }));
  try {
    await load();
  } catch (err) {
    console.error(err);
    main.replaceChildren(
      h(
        'div',
        { class: 'page' },
        h(
          'div',
          { class: 'empty' },
          h('p', { class: 'empty-title' }, 'Nie można otworzyć bazy danych'),
          h('p', { class: 'empty-text' }, 'Zamknij aplikację i otwórz ją ponownie. W trybie prywatnym Safari dane nie są zapisywane.'),
        ),
      ),
    );
    return;
  }
  initRest();
  render(0);
  registerServiceWorker();

  // Zapis szkicu natychmiast przy wyjściu do tła (iOS może ubić aplikację bez ostrzeżenia).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushDraft();
    else syncRest(true);
  });
  window.addEventListener('pagehide', () => flushDraft());
}

void start();
