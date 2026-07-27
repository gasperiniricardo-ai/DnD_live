const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// ---------- Helpers ----------
function getPersonal(clientId, key) {
  const row = db.prepare('SELECT value FROM kv_personal WHERE client_id = ? AND key = ?').get(clientId, key);
  return row ? row.value : null;
}
function setPersonal(clientId, key, value) {
  db.prepare(`
    INSERT INTO kv_personal (client_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(client_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(clientId, key, value, Date.now());
}
function deletePersonal(clientId, key) {
  db.prepare('DELETE FROM kv_personal WHERE client_id = ? AND key = ?').run(clientId, key);
}
function getShared(key) {
  const row = db.prepare('SELECT value FROM kv_shared WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setShared(key, value) {
  db.prepare(`
    INSERT INTO kv_shared (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, Date.now());
}
function deleteShared(key) {
  db.prepare('DELETE FROM kv_shared WHERE key = ?').run(key);
}

function requireClientId(req, res, next) {
  const clientId = req.header('X-Client-Id');
  if (!clientId) return res.status(400).json({ error: 'missing X-Client-Id header' });
  req.clientId = clientId;
  next();
}

// ---------- Personal (per-browser) key-value ----------
app.get('/api/kv/:key', requireClientId, (req, res) => {
  const value = getPersonal(req.clientId, req.params.key);
  if (value === null) return res.status(404).json({ error: 'not found' });
  res.json({ key: req.params.key, value });
});

app.put('/api/kv/:key', requireClientId, (req, res) => {
  const { value } = req.body;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a string' });
  setPersonal(req.clientId, req.params.key, value);
  res.json({ key: req.params.key, value });
});

app.delete('/api/kv/:key', requireClientId, (req, res) => {
  deletePersonal(req.clientId, req.params.key);
  res.json({ key: req.params.key, deleted: true });
});

// ---------- Shared (cross-browser, used for sessions) key-value ----------
app.get('/api/shared/:key', (req, res) => {
  const value = getShared(req.params.key);
  if (value === null) return res.status(404).json({ error: 'not found' });
  res.json({ key: req.params.key, value });
});

app.put('/api/shared/:key', (req, res) => {
  const { value } = req.body;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a string' });
  setShared(req.params.key, value);
  res.json({ key: req.params.key, value });
});

app.delete('/api/shared/:key', (req, res) => {
  deleteShared(req.params.key);
  res.json({ key: req.params.key, deleted: true });
});

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Aster Valion app listening on port ${PORT}`);
});
