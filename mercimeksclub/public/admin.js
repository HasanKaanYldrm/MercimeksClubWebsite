import { busy, byId, message, node, number, request } from './shared.js';

const status = byId('admin-status');
const login = byId('login');
const dashboard = byId('dashboard');
const loginForm = byId('login-form');
const productForm = byId('product-form');
const targetList = byId('targets');
const purchaseList = byId('purchases');
const previous = byId('previous');
const next = byId('next');
const date = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Istanbul'
});
let page = 1;
let loading = false;
let revision = 0;

function showLogin() {
  revision++;
  loading = false;
  dashboard.hidden = true;
  targetList.replaceChildren();
  purchaseList.replaceChildren();
  productForm.reset();
  login.hidden = false;
}

function showError(error) {
  if (error.status === 401 && !dashboard.hidden) showLogin();
  message(status, error.message, true);
  status.scrollIntoView({ block: 'nearest' });
}

function makeTarget(product) {
  const form = node('form', undefined, 'target-form');
  const name = node('strong', product.name);
  const label = node('label', 'Hedef adet');
  const input = node('input');
  input.type = 'number';
  input.min = 1;
  input.max = 1000000;
  input.required = true;
  input.value = product.target;
  input.setAttribute('aria-label', product.name + ' hedef adedi');
  label.append(input);
  const save = node('button', 'Kaydet', 'button outline');
  save.type = 'submit';
  form.append(name, label, save);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    await busy(save, async () => {
      try {
        await request('target', { body: { id: product.id, target: Number(input.value) } });
        message(status, product.name + ' hedefi güncellendi.');
        status.scrollIntoView({ block: 'nearest' });
      } catch (error) {
        showError(error);
      }
    });
  });
  return form;
}

function renderPurchases(purchases) {
  const rows = purchases.map(purchase => {
    const row = node('tr');
    const cells = [
      date.format(new Date(purchase.created_at)), purchase.name, purchase.phone,
      purchase.product, number.format(purchase.quantity), purchase.device_id
    ];
    row.append(...cells.map(text => node('td', text)));
    return row;
  });
  if (!rows.length) {
    const row = node('tr');
    const cell = node('td', 'Henüz satın alma bildirimi yok.');
    cell.colSpan = 6;
    row.append(cell);
    rows.push(row);
  }
  purchaseList.replaceChildren(...rows);
}

async function refresh(newPage = 1, success = '', first = false) {
  if (loading) return;
  loading = true;
  const current = revision;
  const wasPreviousDisabled = previous.disabled;
  const wasNextDisabled = next.disabled;
  previous.disabled = next.disabled = true;
  try {
    const { products, purchases, hasMore } = await request('admin', { query: { page: newPage } });
    if (revision !== current) return;
    page = newPage;
    targetList.replaceChildren(...(products.length ? products.map(makeTarget) : [
      node('p', 'Henüz ürün eklenmedi.', 'notice')
    ]));
    renderPurchases(purchases);
    byId('page').textContent = 'Sayfa ' + number.format(page);
    previous.disabled = page === 1;
    next.disabled = !hasMore;
    login.hidden = true;
    dashboard.hidden = false;
    message(status, success);
  } catch (error) {
    if (revision !== current) return;
    previous.disabled = wasPreviousDisabled;
    next.disabled = wasNextDisabled;
    if (first) showLogin();
    if (first && error.status === 401) message(status, '');
    else showError(error);
  } finally {
    if (revision === current) loading = false;
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  await busy(loginForm.querySelector('button'), async () => {
    try {
      await request('login', { body: { password: new FormData(loginForm).get('password') } });
      loginForm.reset();
      await refresh();
    } catch (error) {
      showError(error);
    }
  });
});

productForm.addEventListener('submit', async event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(productForm));
  await busy(productForm.querySelector('button'), async () => {
    try {
      await request('product', { body: { ...fields, target: Number(fields.target) } });
      productForm.reset();
      await refresh(page, 'Yeni ürün eklendi.');
    } catch (error) {
      showError(error);
    }
  });
});

const logout = byId('logout');
logout.addEventListener('click', () => busy(logout, async () => {
  try {
    await request('logout', { body: {} });
    showLogin();
    message(status, 'Oturum kapatıldı.');
  } catch (error) {
    showError(error);
  }
}));

const download = byId('export');
download.addEventListener('click', () => busy(download, async () => {
  try {
    const blob = await request('export', { download: true });
    const href = URL.createObjectURL(blob);
    const link = node('a');
    link.href = href;
    link.download = 'mercimeksclub-bildirimler.xlsx';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30000);
  } catch (error) {
    showError(error);
  }
}));

previous.addEventListener('click', () => refresh(page - 1));
next.addEventListener('click', () => refresh(page + 1));
message(status, 'Oturum kontrol ediliyor…');
refresh(1, '', true);
