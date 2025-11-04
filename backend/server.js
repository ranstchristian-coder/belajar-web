// server.js — YuRa Personal Finance (Express backend, JSON storage, JWT auth)
// Fitur:
// - POST   /api/login                  -> {token,user}
// - GET    /api/transactions           -> list transaksi user
// - POST   /api/transactions           -> tambah transaksi {type, category, amount, date, note?}
// - PUT    /api/transactions/:id       -> update transaksi (opsional)
// - DELETE /api/transactions/:id       -> hapus transaksi
// Penyimpanan: file JSON per user (users.json & transactions.json)

import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-yura';

// ====== PATHS ======
const __dirname = path.resolve();
const DATA_DIR = path.join(__dirname, 'backend', 'data'); // asumsi dijalankan dari root proyek
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TX_FILE = path.join(DATA_DIR, 'transactions.json');

// ====== UTILS ======
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // Users default: admin / 123456
  if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = [
      {
        id: 'u1',
        username: 'admin',
        // hash dari '123456'
        passwordHash: bcrypt.hashSync('123456', 10),
        displayName: 'Admin'
      }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
  }

  if (!fs.existsSync(TX_FILE)) {
    const empty = { byUser: { u1: [] } };
    fs.writeFileSync(TX_FILE, JSON.stringify(empty, null, 2));
  }
}
ensureDataFiles();

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function readTxAll() {
  return JSON.parse(fs.readFileSync(TX_FILE, 'utf-8'));
}
function writeTxAll(obj) {
  fs.writeFileSync(TX_FILE, JSON.stringify(obj, null, 2));
}

// ====== MIDDLEWARE ======
app.use(express.json());
app.use(
  cors({
    origin: [/^http:\/\/localhost(?::\d+)?$/, /^http:\/\/127\.0\.0\.1(?::\d+)?$/],
    credentials: false
  })
);

// Auth: verify bearer
function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ====== ROUTES ======

// Health
app.get('/api/health', (_, res) => res.json({ ok: true, name: 'YuRa Backend' }));

// Login -> token
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });

  const users = readUsers();
  const user = users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (!bcrypt.compareSync(String(password), user.passwordHash)) return res.status(401).json({ error: 'Wrong password' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName || user.username } });
});

// List transaksi (milik user)
app.get('/api/transactions', authRequired, (req, res) => {
  const all = readTxAll();
  const list = (all.byUser[req.user.id] || []).map((t) => ({
    id: t.id,
    type: t.type,
    category: t.category || '',
    amount: Number(t.amount || 0),
    date: t.date,
    note: t.note || '' // <=== note disertakan
  }));
  res.json({ transactions: list });
});

// Tambah transaksi
app.post('/api/transactions', authRequired, (req, res) => {
  const { type, category, amount, date, note } = req.body || {};
  if (!type || !['income', 'expense'].includes(type)) return res.status(400).json({ error: 'type invalid' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount invalid' });
  const iso = date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);

  const tx = {
    id: nanoid(12),
    type,
    category: String(category || ''),
    amount: Number(amount),
    date: iso,
    note: String(note || '') // <=== simpan note
  };

  const all = readTxAll();
  if (!all.byUser[req.user.id]) all.byUser[req.user.id] = [];
  all.byUser[req.user.id].push(tx);
  writeTxAll(all);

  res.status(201).json({ tx });
});

// Update transaksi
app.put('/api/transactions/:id', authRequired, (req, res) => {
  const { id } = req.params;
  const { type, category, amount, date, note } = req.body || {};

  const all = readTxAll();
  const list = all.byUser[req.user.id] || [];
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const cur = list[idx];
  if (type && ['income', 'expense'].includes(type)) cur.type = type;
  if (category !== undefined) cur.category = String(category || '');
  if (amount !== undefined) cur.amount = Number(amount) || 0;
  if (date) cur.date = String(date).slice(0, 10);
  if (note !== undefined) cur.note = String(note || ''); // <=== update note

  list[idx] = cur;
  all.byUser[req.user.id] = list;
  writeTxAll(all);

  res.json({ tx: cur });
});

// Hapus transaksi
app.delete('/api/transactions/:id', authRequired, (req, res) => {
  const { id } = req.params;
  const all = readTxAll();
  const list = all.byUser[req.user.id] || [];
  const next = list.filter((t) => t.id !== id);
  all.byUser[req.user.id] = next;
  writeTxAll(all);
  res.json({ ok: true });
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`YuRa backend running at http://localhost:${PORT}`);
});
