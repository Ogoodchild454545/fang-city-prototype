// v0.19.1 tutorial-step system. A list of small, ordered steps; each one teaches a single thing and is shown
// only at the moment it applies. The runner walks the list in order and returns the first step that is
// (a) not learned yet, (b) not already satisfied (its `done` test marks it learned silently), and (c) relevant
// right now (`when`). So only ever one hint shows, and steps never fire out of context.
//
//   step = { id, when(s) -> bool, html(s) -> string, done?(s) -> bool, once?: true (default), scope?: string }
//
// Learned steps persist per device in localStorage ('fangcity.hints'). Steps with once:false are per-session
// coaching (their id should encode the situation, e.g. 'walk-t1'), and are only hidden by a dismiss tap.
// The battle board uses BATTLE_STEPS (js/ui/tactics.js); the guided intro (base, factory...) reuses runSteps.
export const HINT_KEY = 'fangcity.hints';
export function learned() { try { return JSON.parse(localStorage.getItem(HINT_KEY) || '{}'); } catch (e) { return {}; } }
export function learn(id) {
  const h = learned(); if (h[id]) return;
  h[id] = 1; try { localStorage.setItem(HINT_KEY, JSON.stringify(h)); } catch (e) { /* private mode */ }
}
export function forget(ids) {
  const h = learned(); for (const id of ids || Object.keys(h)) delete h[id];
  try { localStorage.setItem(HINT_KEY, JSON.stringify(h)); } catch (e) { /* private mode */ }
}
// dismissed: a per-session set of ids the player tapped away (so a dismissed coaching line stays gone)
export function runSteps(steps, s, dismissed = {}) {
  const seen = learned();
  for (const st of steps) {
    const once = st.once !== false;
    if (once && seen[st.id]) continue;
    if (st.done && st.done(s)) { if (once) learn(st.id); continue; }
    if (dismissed[st.id]) continue;
    if (!st.when(s)) continue;
    return { id: st.id, html: st.html(s), once };
  }
  return null;
}
