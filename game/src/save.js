// save.js — SOLCOSTA saves: money, missions cleared and best stats in
// localStorage. One clear job: persist progress between sessions, nothing else.
const KEY = 'solcosta-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      missionsDone: typeof data.missionsDone === 'number' ? data.missionsDone : 0,
      bestMoney: typeof data.bestMoney === 'number' ? data.bestMoney : 0,
    };
  } catch (_err) {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: state.money,
      missionsDone: state.missionsDone,
      bestMoney: Math.max(state.bestMoney || 0, state.money),
    }));
    return true;
  } catch (_err) {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (_err) { /* private mode */ }
}
