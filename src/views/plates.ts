import { LIMITS, state } from '../store';
import { openSheet } from '../ui/sheet';
import { clamp, fmtInput, fmtKg, fmtNum, h, parseNum, round } from '../util';

/** Talerze na jedną stronę gryfu, zachłannie od największego. */
export function platesFor(target: number, bar: number, plates: number[]) {
  const perSide = (target - bar) / 2;
  const out: number[] = [];
  if (perSide <= 0) return { perSide: Math.max(0, perSide), plates: out, rest: 0 };
  let left = round(perSide, 0.001);
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (left + 1e-9 >= p) {
      out.push(p);
      left = round(left - p, 0.001);
    }
  }
  return { perSide, plates: out, rest: left };
}

export function openPlates(initial: number | null) {
  const { barKg, plates } = state.settings;
  const input = h('input', {
    class: 'input input-lg num',
    type: 'text',
    inputMode: 'decimal',
    enterKeyHint: 'done',
    autocomplete: 'off',
    maxlength: '7',
    'aria-label': 'Ciężar docelowy w kg',
    placeholder: fmtNum(Math.max(barKg, 60)),
    value: initial && initial > 0 ? fmtInput(initial) : '',
  });
  const out = h('div', { class: 'plates-out' });

  const render = () => {
    const raw = parseNum(input.value);
    const target = raw === null ? Math.max(barKg, 60) : clamp(raw, 0, LIMITS.weight);
    const r = platesFor(target, barKg, plates);
    const counts = new Map<number, number>();
    for (const p of r.plates) counts.set(p, (counts.get(p) ?? 0) + 1);
    const maxPlate = Math.max(...plates, 1);

    out.replaceChildren(
      target < barKg
        ? h('p', { class: 'sheet-text' }, `Ciężar mniejszy niż sam gryf (${fmtKg(barKg)}).`)
        : r.plates.length === 0
          ? h('p', { class: 'sheet-text' }, `Sam gryf: ${fmtKg(barKg)}.`)
          : h(
              'div',
              null,
              h(
                'div',
                { class: 'bar-visual', 'aria-hidden': 'true' },
                h('div', { class: 'bar-sleeve' }),
                r.plates.map((p) =>
                  h('div', {
                    class: 'bar-plate',
                    style: `--h:${Math.round(36 + (p / maxPlate) * 64)}%`,
                  }),
                ),
                h('div', { class: 'bar-collar' }),
              ),
              h(
                'ul',
                { class: 'plates-list' },
                [...counts].map(([p, n]) =>
                  h('li', null, h('span', { class: 'num' }, `${n} ×`), h('strong', { class: 'num' }, fmtKg(p))),
                ),
              ),
            ),
      h(
        'p',
        { class: 'footnote' },
        `Na stronę: ${fmtKg(round(r.perSide, 0.01))} · gryf ${fmtKg(barKg)}`,
        r.rest > 0.001 ? ` · brakuje ${fmtKg(round(r.rest * 2, 0.01))} (nie da się dokładnie)` : '',
      ),
    );
  };
  input.addEventListener('input', render);
  render();

  openSheet({
    title: 'Kalkulator talerzy',
    content: [
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ciężar całkowity (kg)'), input),
      out,
      h('p', { class: 'footnote' }, 'Gryf i talerze zmienisz w zakładce Plan.'),
    ],
  });
}
