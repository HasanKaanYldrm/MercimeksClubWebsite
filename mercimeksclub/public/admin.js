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
const editor = byId('edit-dialog');
const editClose = byId('edit-close');
const editStatus = byId('edit-status');
const editProduct = byId('edit-product');
const editPurchase = byId('edit-purchase');
const date = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Istanbul'
});
let page = 1;
let products = [];
let hasMore = false;
let editingId;
let revision = 0;

function showLogin() {
  revision++;
  products = [];
  if (editor.open) editor.close();
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

function openEditor(form, record) {
  const purchase = form === editPurchase;
  editProduct.hidden = purchase;
  editPurchase.hidden = !purchase;
  if (purchase) {
    const options = products.map(product => {
      const option = node('option', product.name);
      option.value = product.id;
      return option;
    });
    form.elements.productId.replaceChildren(...options);
    form.elements.productId.value = record.product_id;
  }
  for (const field of form.elements) {
    if (Object.hasOwn(record, field.name)) field.value = record[field.name];
  }
  editingId = record.id;
  byId('edit-title').textContent = purchase ? 'Bildirimi düzenle' : 'Ürünü düzenle';
  message(editStatus, '');
  editor.showModal();
}

function makeActions(record, kind) {
  const purchase = kind === 'purchase';
  const actions = node('div', undefined, 'admin-actions');
  const edit = node('button', 'Düzenle', 'button outline');
  const remove = node('button', 'Sil', 'button outline danger');
  edit.type = remove.type = 'button';
  edit.setAttribute('aria-label', record.name + ' kaydını düzenle');
  remove.setAttribute('aria-label', record.name + ' kaydını sil');
  edit.addEventListener('click', () => openEditor(purchase ? editPurchase : editProduct, record));
  remove.addEventListener('click', async () => {
    const confirmation = purchase
      ? record.name + ' adına ait “' + record.product + '” bildirimi silinsin mi?'
      : '“' + record.name + '” ürünü ve bu ürüne ait tüm bildirimler kalıcı olarak silinsin mi?';
    if (!window.confirm(confirmation)) return;
    await busy(remove, async () => {
      try {
        await request('delete-' + kind, { body: { id: record.id } });
        await refresh(page, purchase ? 'Bildirim silindi.' : 'Ürün ve bağlı bildirimler silindi.');
        status.scrollIntoView({ block: 'nearest' });
      } catch (error) {
        showError(error);
      }
    });
  });
  actions.append(edit, remove);
  return actions;
}

function makeProductRow(product) {
  const row = node('div', undefined, 'admin-product');
  const details = node('div');
  details.append(node('strong', product.name), node('p', 'Hedef: ' + number.format(product.target) + ' adet', 'muted'));
  row.append(details, makeActions(product, 'product'));
  return row;
}

function renderPurchases(purchases) {
  const rows = purchases.map(purchase => {
    const row = node('tr');
    const cells = [
      date.format(new Date(purchase.created_at)), purchase.name, purchase.phone,
      purchase.product, number.format(purchase.quantity), purchase.device_id
    ];
    row.append(...cells.map(text => node('td', text)));
    const actions = node('td');
    actions.append(makeActions(purchase, 'purchase'));
    row.append(actions);
    return row;
  });
  if (!rows.length) {
    const row = node('tr');
    const cell = node('td', 'Henüz satın alma bildirimi yok.');
    cell.colSpan = 7;
    row.append(cell);
    rows.push(row);
  }
  purchaseList.replaceChildren(...rows);
}

async function refresh(newPage = 1, success = '', first = false) {
  const current = ++revision;
  previous.disabled = next.disabled = true;
  try {
    let result = await request('admin', { query: { page: newPage } });
    if (revision !== current) return;
    if (newPage > 1 && !result.purchases.length) {
      newPage = 1;
      result = await request('admin', { query: { page: newPage } });
      if (revision !== current) return;
    }
    page = newPage;
    products = result.products;
    hasMore = result.hasMore;
    targetList.replaceChildren(...(products.length ? products.map(makeProductRow) : [
      node('p', 'Henüz ürün eklenmedi.', 'notice')
    ]));
    renderPurchases(result.purchases);
    byId('page').textContent = 'Sayfa ' + number.format(page);
    login.hidden = true;
    dashboard.hidden = false;
    message(status, success);
  } catch (error) {
    if (revision !== current) return;
    if (first) showLogin();
    if (first && error.status === 401) message(status, '');
    else showError(error);
  } finally {
    if (revision === current) {
      previous.disabled = page === 1;
      next.disabled = !hasMore;
    }
  }
}

editClose.addEventListener('click', () => editor.close());
editor.addEventListener('cancel', event => {
  if (editClose.disabled) event.preventDefault();
});
editor.addEventListener('close', () => {
  editProduct.reset();
  editPurchase.reset();
  editPurchase.elements.productId.replaceChildren();
});

for (const form of [editProduct, editPurchase]) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (editClose.disabled) return;
    const purchase = form === editPurchase;
    const body = { id: editingId, ...Object.fromEntries(new FormData(form)) };
    const numericField = purchase ? 'quantity' : 'target';
    body[numericField] = Number(body[numericField]);
    message(editStatus, '');
    editClose.disabled = true;
    await busy(form.querySelector('button'), async () => {
      try {
        await request(purchase ? 'update-purchase' : 'update-product', { body });
        editor.close();
        await refresh(page, purchase ? 'Bildirim güncellendi.' : 'Ürün güncellendi.');
        status.scrollIntoView({ block: 'nearest' });
      } catch (error) {
        if (error.status === 401) showError(error);
        else message(editStatus, error.message, true);
      } finally {
        editClose.disabled = false;
      }
    });
  });
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
