const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { OAuth2Client } = require('google-auth-library');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const oauthClient = new OAuth2Client();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, '[]', 'utf8');
}

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function upsertUser(profile) {
  const users = loadUsers();
  const existingIndex = users.findIndex(user => user.id === profile.id);
  const now = new Date().toISOString();
  const nextUser = {
    id: profile.id,
    email: profile.email,
    emailVerified: !!profile.emailVerified,
    name: profile.name || profile.email,
    picture: profile.picture || '',
    provider: 'google',
    createdAt: existingIndex >= 0 ? users[existingIndex].createdAt : now,
    lastLoginAt: now,
  };

  if (existingIndex >= 0) {
    users[existingIndex] = { ...users[existingIndex], ...nextUser };
  } else {
    users.push(nextUser);
  }

  saveUsers(users);
  return nextUser;
}

app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'ru_market_sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  }
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/config.js', (_req, res) => {
  res.type('application/javascript');
  res.send(`window.APP_CONFIG = ${JSON.stringify({ googleClientId: GOOGLE_CLIENT_ID })};`);
});

app.post('/auth/google', async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'На сервере не задан GOOGLE_CLIENT_ID.' });
    }

    const credential = req.body?.credential;
    if (!credential) {
      return res.status(400).json({ error: 'Не передан Google credential.' });
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ error: 'Не удалось проверить Google-профиль.' });
    }

    const user = upsertUser({
      id: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
    });

    req.session.user = user;
    req.session.save(() => {
      res.json({ ok: true, user });
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Вход через Google не прошёл проверку.' });
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ru_market_sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, user: req.session.user });
});

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется вход через Google.' });
  }
  next();
}

function normalizeMoexCandles(data) {
  if (!data || !data.candles || !Array.isArray(data.candles.data)) return [];
  const columns = data.candles.columns || [];
  return data.candles.data.map((row) => {
    const item = {};
    columns.forEach((col, idx) => {
      item[col] = row[idx];
    });
    return item;
  });
}

function buildMoexCandlesUrl({ engine, market, board, security, from, till, interval }) {
  const boardPart = board ? `/boards/${encodeURIComponent(board)}` : '';
  const url = new URL(`https://iss.moex.com/iss/engines/${encodeURIComponent(engine)}/markets/${encodeURIComponent(market)}${boardPart}/securities/${encodeURIComponent(security)}/candles.json`);
  if (from) url.searchParams.set('from', from);
  if (till) url.searchParams.set('till', till);
  if (interval) url.searchParams.set('interval', String(interval));
  return url.toString();
}

async function fetchMoexCandles(params) {
  const url = buildMoexCandlesUrl(params);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'RU-Market-Navigator/1.0',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`MOEX HTTP ${response.status}`);
  }

  const data = await response.json();
  return normalizeMoexCandles(data);
}

app.get('/api/moex/candles', requireAuth, async (req, res) => {
  try {
    const { engine, market, board, security, from, till, interval } = req.query;
    if (!engine || !market || !security) {
      return res.status(400).json({ error: 'Нужно передать engine, market и security.' });
    }

    const data = await fetchMoexCandles({ engine, market, board, security, from, till, interval: interval || '24' });
    res.json({ data });
  } catch (error) {
    console.error('MOEX candles error:', error);
    res.status(502).json({ error: 'Не удалось получить данные MOEX.' });
  }
});

async function detectFirstTradeDate({ board, security }) {
  const currentYear = new Date().getFullYear();
  for (let startYear = 1995; startYear <= currentYear; startYear += 5) {
    const endYear = Math.min(startYear + 4, currentYear);
    const chunkData = await fetchMoexCandles({
      engine: 'stock',
      market: 'shares',
      board,
      security,
      from: `${startYear}-01-01`,
      till: `${endYear}-12-31`,
      interval: '24',
    });

    if (!chunkData.length) continue;

    for (let year = startYear; year <= endYear; year += 1) {
      const yearData = await fetchMoexCandles({
        engine: 'stock',
        market: 'shares',
        board,
        security,
        from: `${year}-01-01`,
        till: `${year}-12-31`,
        interval: '24',
      });
      if (yearData.length) {
        return String(yearData[0].begin).slice(0, 10);
      }
    }
  }
  return '2000-01-01';
}

app.get('/api/moex/first-trade', requireAuth, async (req, res) => {
  try {
    const { board, security } = req.query;
    if (!board || !security) {
      return res.status(400).json({ error: 'Нужно передать board и security.' });
    }
    const firstTradeDate = await detectFirstTradeDate({ board, security });
    res.json({ firstTradeDate });
  } catch (error) {
    console.error('First trade detection error:', error);
    res.status(502).json({ error: 'Не удалось определить первую дату торгов.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RU Market Navigator app listening on http://localhost:${PORT}`);
});
