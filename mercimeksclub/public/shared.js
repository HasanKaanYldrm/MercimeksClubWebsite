export const byId = id => document.getElementById(id);
export const number = new Intl.NumberFormat('tr-TR');

export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function message(element, text, error = false) {
  element.textContent = text;
  element.hidden = !text;
  element.dataset.error = String(error);
}

export async function request(action, options = {}) {
  const { body, query = {}, download = false } = options;
  const params = new URLSearchParams({ action, ...query });
  const response = await fetch('/api/campaign?' + params, {
    cache: 'no-store',
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
  }).catch(() => {
    throw new Error('Bağlantı kurulamadı. Lütfen tekrar deneyin.');
  });
  if (response.ok && download) return response.blob();
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error ?? 'Bağlantı kurulamadı. Lütfen tekrar deneyin.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function busy(button, work) {
  button.disabled = true;
  try {
    return await work();
  } finally {
    button.disabled = false;
  }
}
