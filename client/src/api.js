const BASE = '/api';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Multipart upload — no Content-Type header here; the browser sets one with
// the correct multipart boundary itself when given a FormData body.
async function upload(path, formData) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const getState = () => request('/state');
export const spin = () => request('/spin', { method: 'POST' });
export const loadEntrants = () => request('/load-entrants', { method: 'POST' });
export const resetRaffle = () => request('/reset', { method: 'POST' });

export const getPrizes = () => request('/prizes');
export const addPrize = (formData) => upload('/prizes', formData);
export const deletePrize = (id) => request(`/prizes/${id}`, { method: 'DELETE' });
export const setCurrentPrize = (prizeId) =>
  request('/current-prize', { method: 'POST', body: JSON.stringify({ prizeId }) });
