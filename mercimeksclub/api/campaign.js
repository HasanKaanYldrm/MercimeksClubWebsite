import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { strToU8, zipSync } from 'fflate';

const derive = promisify(scrypt);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretToken = /^[0-9a-f]{64}$/;
const sessionAge = 8 * 60 * 60;
const production = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const sessionName = production ? '__Host-mercimeks-admin' : 'mercimeks-admin';
const deviceName = production ? '__Host-mercimeks-device' : 'mercimeks-device';
let pool;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const digest = value => createHash('sha256').update(value).digest('hex');
const sign = (purpose, value) => createHmac('sha256', process.env.DEVICE_SECRET)
  .update(purpose + ':' + value).digest('hex');
const equal = (a, b) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

function readCookie(req, name) {
  const cookies = (req.headers.cookie ?? '').split(';').map(item => item.trim());
  return cookies.find(item => item.startsWith(name + '='))?.slice(name.length + 1) ?? '';
}

function setCookie(res, name, value, age) {
  res.setHeader('Set-Cookie', name + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age='
    + age + (production ? '; Secure' : ''));
}

function device(req) {
  const [id, signature, extra] = readCookie(req, deviceName).split('.');
  if (!extra && uuid.test(id) && secretToken.test(signature) && equal(signature, sign('cookie', id))) {
    return id;
  }
}

async function parseBody(req) {
  if (req.headers.origin !== process.env.APP_ORIGIN) throw new RequestError(403, 'İstek kaynağı doğrulanamadı.');
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'Geçersiz istek biçimi.');
  }
  let body;
  try {
    // Vercel may provide a pre-parsed JSON body.
    if (req.body !== undefined) {
      const encoded = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (Buffer.byteLength(encoded) > 8192) throw new RequestError(413, 'İstek çok büyük.');
      body = JSON.parse(encoded);
    } else {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) throw new RequestError(413, 'İstek çok büyük.');
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'İstek okunamadı.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, 'Geçersiz istek.');
  return body;
}

function inputText(value, min, max, multiline = false) {
  const clean = typeof value === 'string' ? value.trim() : '';
  const controls = multiline ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/ : /[\x00-\x1F\x7F]/;
  if (clean.length < min || clean.length > max || controls.test(clean)) {
    throw new RequestError(400, 'Metin alanlarını kontrol edin.');
  }
  return clean;
}

function count(value, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RequestError(400, 'Adet 1 ile ' + max + ' arasında olmalı.');
  }
  return value;
}

function purchaseFields(body) {
  const name = inputText(body.name, 2, 100);
  const phone = inputText(body.phone, 7, 30).replace(/[\s().-]/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(phone)) throw new RequestError(400, 'Geçerli bir telefon numarası girin.');
  return [name, phone, count(body.quantity, 10000)];
}

function productLink(value) {
  try {
    const link = new URL(inputText(value, 8, 2048));
    if (link.protocol === 'https:' && !link.username && !link.password) return link.href;
  } catch {
    // The same validation message applies to malformed and unsupported links.
  }
  throw new RequestError(400, 'Geçerli bir HTTPS ürün bağlantısı girin.');
}

async function limit(db, scope, value, max, seconds) {
  const { rows } = await db.query(`
    INSERT INTO rate_limits (key, hits, expires_at)
    VALUES ($1, 1, now() + $2::integer * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE least(rate_limits.hits + 1, $3 + 1) END,
      expires_at = CASE WHEN rate_limits.expires_at <= now() THEN excluded.expires_at ELSE rate_limits.expires_at END
    RETURNING hits`, [sign(scope, value), seconds, max]);
  if (rows[0].hits > max) throw new RequestError(429, 'Çok fazla deneme. Bir süre sonra tekrar deneyin.');
}

function address(req) {
  if (production) return String(req.headers['x-vercel-forwarded-for'] ?? 'unknown').split(',')[0].trim();
  return req.socket.remoteAddress ?? 'local';
}

async function session(db, req) {
  const token = readCookie(req, sessionName);
  if (!secretToken.test(token)) throw new RequestError(401, 'Yönetici oturumu gerekli.');
  const hash = digest(token);
  const result = await db.query('SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()', [hash]);
  if (!result.rowCount) throw new RequestError(401, 'Yönetici oturumu gerekli.');
  return hash;
}

async function listProducts(db) {
  const { rows } = await db.query(`
    SELECT p.id, p.name, p.description, p.url, p.target, coalesce(t.total,0) AS received
    FROM products p LEFT JOIN (
      SELECT product_id, sum(quantity) AS total FROM purchases GROUP BY product_id
    ) t ON t.product_id=p.id
    ORDER BY p.created_at, p.id`);
  return rows;
}

const purchaseQuery = `
  SELECT b.id, b.product_id, b.name, b.phone, p.name AS product, b.quantity, b.device_id, b.created_at
  FROM purchases b JOIN products p ON p.id=b.product_id
  ORDER BY b.created_at DESC, b.id DESC`;

const time = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'medium'
});

const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function xml(value) {
  return String(value).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
    .replace(/\r/g, '&#13;');
}

function makeWorkbook(rows) {
  const table = rows.map((row, index) => {
    const cells = row.map((value, column) => {
      const position = String.fromCharCode(65 + column) + (index + 1);
      if (typeof value === 'number') return '<c r="' + position + '"><v>' + value + '</v></c>';
      return '<c r="' + position + '" t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
    }).join('');
    return '<row r="' + (index + 1) + '">' + cells + '</row>';
  }).join('');
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>',
    '_rels/.rels': '<Relationships xmlns="' + relationships + '"><Relationship Id="rId1" Type="'
      + office + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="' + spreadsheet + '" xmlns:r="' + office
      + '"><bookViews><workbookView/></bookViews><sheets><sheet name="Satın alma bildirimleri" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="' + relationships + '"><Relationship Id="rId1" Type="'
      + office + '/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="' + spreadsheet
      + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
      + '</sheetView></sheetViews><cols>'
      + [28, 30, 24, 38, 10, 68].map((width, index) => {
        const column = index + 1;
        return '<col min="' + column + '" max="' + column + '" width="' + width + '" customWidth="1"/>';
      }).join('')
      + '</cols><sheetData>' + table + '</sheetData><autoFilter ref="A1:F' + rows.length + '"/></worksheet>'
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [
    name, strToU8(declaration + content)
  ])), { level: 6 });
}

async function exportPurchases(db, res) {
  const { rows } = await db.query(purchaseQuery);
  const file = makeWorkbook([
    ['Tarih (Türkiye saati)', 'Ad soyad', 'Telefon', 'Ürün', 'Adet', 'Tarayıcı kimliği'],
    ...rows.map(row => [
      time.format(new Date(row.created_at)), row.name, row.phone, row.product, row.quantity, row.device_id
    ])
  ]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mercimeksclub-bildirimler.xlsx"');
  res.end(Buffer.from(file));
}

function json(res, payload, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function createHandler(getDb) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const action = params.get('action') ?? 'products';
      const getActions = ['products', 'admin', 'export'];
      const postActions = [
        'device', 'purchase', 'login', 'logout', 'product', 'target',
        'update-product', 'delete-product', 'update-purchase', 'delete-purchase'
      ];
      const expected = getActions.includes(action) ? 'GET' : postActions.includes(action) ? 'POST' : null;
      if (!expected) throw new RequestError(404, 'İşlem bulunamadı.');
      if (req.method !== expected) {
        res.setHeader('Allow', expected);
        throw new RequestError(405, 'İstek yöntemi desteklenmiyor.');
      }
      const body = expected === 'POST' ? await parseBody(req) : null;
      const db = getDb();

      if (action === 'products') return json(res, {
        products: await listProducts(db),
        privacyContact: process.env.PRIVACY_CONTACT ?? ''
      });
      if (action === 'device') {
        if (!device(req)) {
          const id = randomUUID();
          setCookie(res, deviceName, id + '.' + sign('cookie', id), 60 * 60 * 24 * 180);
        }
        return json(res, { ok: true });
      }
      if (action === 'purchase') {
        const id = device(req);
        if (!id) throw new RequestError(400, 'Bildirim için tarayıcı çerezlerine izin verin ve formu yeniden açın.');
        if (typeof body.id !== 'string' || typeof body.productId !== 'string'
          || !uuid.test(body.id) || !uuid.test(body.productId)) {
          throw new RequestError(400, 'Geçersiz ürün veya bildirim.');
        }
        const [name, phone, quantity] = purchaseFields(body);
        const deviceId = sign('stored-device', id);
        const prior = await db.query('SELECT device_id FROM purchases WHERE id=$1', [body.id]);
        if (prior.rows[0]?.device_id === deviceId) return json(res, { ok: true });
        await limit(db, 'purchase-ip', address(req), 60, 900);
        await limit(db, 'purchase-device', id, 12, 900);
        const result = await db.query(`
          INSERT INTO purchases (id, product_id, name, phone, quantity, device_id)
          SELECT $1, id, $3, $4, $5, $6 FROM products WHERE id=$2
          ON CONFLICT (id) DO NOTHING`, [body.id, body.productId, name, phone, quantity, deviceId]);
        if (!result.rowCount) {
          const existing = await db.query('SELECT device_id FROM purchases WHERE id=$1', [body.id]);
          if (existing.rows[0]?.device_id !== deviceId) throw new RequestError(409, 'Bildirim kaydedilemedi.');
        }
        return json(res, { ok: true }, 201);
      }
      if (action === 'login') {
        const password = body.password;
        if (typeof password !== 'string' || !password.length || password.length > 256) {
          throw new RequestError(400, 'Yönetici parolasını girin.');
        }
        await limit(db, 'login-ip', address(req), 6, 900);
        await limit(db, 'login-total', 'all', 60, 900);
        const [salt, hash] = (process.env.ADMIN_PASSWORD_HASH ?? '').split(':');
        if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(hash)) {
          throw new RequestError(503, 'Yönetici girişi henüz yapılandırılmamış.');
        }
        const candidate = await derive(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
        if (!timingSafeEqual(candidate, Buffer.from(hash, 'hex'))) throw new RequestError(401, 'Parola hatalı.');
        await db.query('DELETE FROM admin_sessions WHERE expires_at<=now()');
        await db.query('DELETE FROM rate_limits WHERE expires_at<=now()');
        const token = randomBytes(32).toString('hex');
        const priorToken = readCookie(req, sessionName);
        if (secretToken.test(priorToken)) await db.query('DELETE FROM admin_sessions WHERE token_hash=$1', [digest(priorToken)]);
        await db.query("INSERT INTO admin_sessions VALUES ($1, now() + interval '8 hours')", [digest(token)]);
        setCookie(res, sessionName, token, sessionAge);
        return json(res, { ok: true });
      }

      const sessionHash = await session(db, req);
      if (action === 'logout') {
        await db.query('DELETE FROM admin_sessions WHERE token_hash=$1', [sessionHash]);
        setCookie(res, sessionName, '', 0);
        return json(res, { ok: true });
      }
      if (action === 'admin') {
        const page = Number(params.get('page') ?? 1);
        if (!Number.isInteger(page) || page < 1 || page > 1000000) throw new RequestError(400, 'Geçersiz sayfa.');
        const [products, result] = await Promise.all([
          listProducts(db), db.query(purchaseQuery + ' LIMIT 51 OFFSET $1', [(page - 1) * 50])
        ]);
        return json(res, { products, purchases: result.rows.slice(0, 50), hasMore: result.rows.length > 50 });
      }
      if (action === 'export') return await exportPurchases(db, res);
      if (action !== 'product' && (typeof body.id !== 'string' || !uuid.test(body.id))) {
        throw new RequestError(400, 'Geçersiz ürün veya bildirim.');
      }
      if (action === 'product' || action === 'update-product') {
        const name = inputText(body.name, 2, 100);
        const description = inputText(body.description, 2, 1500, true);
        const link = productLink(body.url);
        const target = count(body.target, 1000000);
        if (action === 'product') {
          await db.query('INSERT INTO products (id,name,description,url,target) VALUES ($1,$2,$3,$4,$5)',
            [randomUUID(), name, description, link, target]);
          return json(res, { ok: true }, 201);
        }
        const result = await db.query(
          'UPDATE products SET name=$2, description=$3, url=$4, target=$5 WHERE id=$1',
          [body.id, name, description, link, target]
        );
        if (!result.rowCount) throw new RequestError(404, 'Ürün bulunamadı.');
        return json(res, { ok: true });
      }
      if (action === 'delete-product') {
        const result = await db.query(`
          WITH removed_purchases AS (DELETE FROM purchases WHERE product_id=$1)
          DELETE FROM products WHERE id=$1`, [body.id]);
        if (!result.rowCount) throw new RequestError(404, 'Ürün bulunamadı.');
        return json(res, { ok: true });
      }
      if (action === 'update-purchase') {
        if (typeof body.productId !== 'string' || !uuid.test(body.productId)) {
          throw new RequestError(400, 'Geçersiz ürün.');
        }
        const result = await db.query(`
          UPDATE purchases AS b SET product_id=p.id, name=$3, phone=$4, quantity=$5
          FROM products AS p WHERE b.id=$1 AND p.id=$2`,
        [body.id, body.productId, ...purchaseFields(body)]);
        if (!result.rowCount) throw new RequestError(404, 'Bildirim veya ürün bulunamadı.');
        return json(res, { ok: true });
      }
      if (action === 'delete-purchase') {
        const result = await db.query('DELETE FROM purchases WHERE id=$1', [body.id]);
        if (!result.rowCount) throw new RequestError(404, 'Bildirim bulunamadı.');
        return json(res, { ok: true });
      }
      const result = await db.query('UPDATE products SET target=$1 WHERE id=$2',
        [count(body.target, 1000000), body.id]);
      if (!result.rowCount) throw new RequestError(404, 'Ürün bulunamadı.');
      return json(res, { ok: true });
    } catch (error) {
      if (error instanceof RequestError) return json(res, { error: error.message }, error.status);
      if (error.code === '23503') {
        return json(res, { error: 'Ürün veya bildirim değişti. Sayfayı yenileyip tekrar deneyin.' }, 409);
      }
      console.error('Campaign request failed', { code: error.code ?? error.name });
      return json(res, { error: 'İşlem şu anda tamamlanamadı. Lütfen tekrar deneyin.' }, 503);
    }
  };
}

export default createHandler(() => {
  if (!process.env.DATABASE_URL || !process.env.APP_ORIGIN || !secretToken.test(process.env.DEVICE_SECRET ?? '')) {
    throw new RequestError(503, 'Kampanya henüz yapılandırılmamış.');
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      query_timeout: 12000
    });
    pool.on('error', error => console.error('Idle database connection failed', { code: error.code ?? error.name }));
  }
  return pool;
});
