import { busy, byId, message, node, number, request } from './shared.js';

const list = byId('products');
const status = byId('status');
const dialog = byId('report');
const form = byId('report-form');
const submit = form.querySelector('[type=submit]');
const formStatus = byId('form-status');
let selection;
let initializingDevice;
let saving = false;

function makeProduct(product, index, openIds) {
  const item = node('details', undefined, 'product');
  item.dataset.id = product.id;
  item.open = openIds.has(product.id);
  const summary = node('summary');
  const serial = node('span', String(index + 1).padStart(2, '0'), 'item-number');
  serial.setAttribute('aria-hidden', 'true');
  const received = Number(product.received);
  const progress = node('progress');
  progress.max = product.target;
  progress.value = Math.min(received, product.target);
  progress.setAttribute('aria-label', product.name + ' hedef ilerlemesi');
  const caption = number.format(received) + ' / ' + number.format(product.target) + ' adet bildirildi';
  const stats = node('span', undefined, 'progress');
  stats.append(node('span', caption), progress);
  const chevron = node('span', '⌄', 'chevron');
  chevron.setAttribute('aria-hidden', 'true');
  summary.append(serial, node('span', product.name, 'product-name'), stats, chevron);
  const body = node('div', undefined, 'product-body');
  const actions = node('div', undefined, 'actions');
  const link = node('a', 'Ürün bağlantısını aç ↗', 'button outline');
  link.href = product.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', product.name + ' satın alma bağlantısını yeni sekmede aç');
  const report = node('button', 'Satın aldım', 'button primary');
  report.type = 'button';
  report.addEventListener('click', async () => {
    if (dialog.open) return;
    selection = { productId: product.id, id: crypto.randomUUID() };
    form.reset();
    byId('selected').textContent = product.name;
    message(formStatus, 'Form hazırlanıyor…');
    submit.disabled = true;
    dialog.showModal();
    const opened = selection;
    try {
      initializingDevice ??= request('device', { body: {} }).finally(() => {
        initializingDevice = undefined;
      });
      await initializingDevice;
      if (selection === opened) {
        submit.disabled = false;
        message(formStatus, '');
      }
    } catch (error) {
      if (selection === opened) message(formStatus, error.message + ' Formu kapatıp yeniden açabilirsiniz.', true);
    }
  });
  actions.append(link, report);
  body.append(
    node('p', product.description, 'description'),
    node('p', 'Ürünü aşağıdaki bağlantıdan satın al. Teslimat adresi olarak TEV İnanç Lisesi’nin doğrulanmış adresini kullan. Siparişi tamamladıktan sonra “Satın aldım” düğmesiyle adedi bildir.', 'instructions'),
    actions
  );
  item.append(summary, body);
  return item;
}

async function refresh(success = '', focusId = '') {
  try {
    const { products, privacyContact } = await request('products');
    const openIds = new Set([...list.querySelectorAll('details[open]')].map(item => item.dataset.id));
    list.replaceChildren(...products.map((product, index) => makeProduct(product, index, openIds)));
    const total = byId('total');
    total.textContent = number.format(products.length) + ' ürün';
    total.hidden = !products.length;
    byId('privacy-contact').textContent = privacyContact ? 'İletişim: ' + privacyContact : '';
    message(status, success || (products.length ? '' : 'Listeye henüz ürün eklenmedi.'));
    if (focusId) list.querySelector('[data-id="' + focusId + '"] summary')?.focus();
  } catch (error) {
    message(status, [success, error.message].filter(Boolean).join(' '), true);
  }
}

const close = byId('close');
close.addEventListener('click', () => {
  if (!saving) dialog.close();
});
dialog.addEventListener('close', () => {
  selection = undefined;
  form.reset();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled || !selection) return;
  const current = selection;
  const fields = new FormData(form);
  message(formStatus, '');
  await busy(submit, async () => {
    saving = true;
    close.disabled = true;
    try {
      await request('purchase', { body: {
        ...current, name: fields.get('name'), phone: fields.get('phone'), quantity: Number(fields.get('quantity'))
      } });
      if (selection === current && dialog.open) dialog.close();
      await refresh('Teşekkürler! Satın alma bildirimin kaydedildi.', current.productId);
    } catch (error) {
      if (selection === current) message(formStatus, error.message, true);
    } finally {
      saving = false;
      close.disabled = false;
    }
  });
});
dialog.addEventListener('cancel', event => {
  if (saving) event.preventDefault();
});
message(status, 'Liste yükleniyor…');
refresh();
