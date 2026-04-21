const COMPANIES = [
  {name:'Сбербанк', ticker:'SBER', board:'TQBR', sector:'Финансы', focus:'ставка ЦБ, дивиденды'},
  {name:'Газпром', ticker:'GAZP', board:'TQBR', sector:'Нефть и газ', focus:'экспорт, дивиденды'},
  {name:'Роснефть', ticker:'ROSN', board:'TQBR', sector:'Нефть и газ', focus:'налоги, Brent'},
  {name:'Лукойл', ticker:'LKOH', board:'TQBR', sector:'Нефть и газ', focus:'дивиденды, buyback'},
  {name:'НОВАТЭК', ticker:'NVTK', board:'TQBR', sector:'Нефть и газ', focus:'СПГ, capex'},
  {name:'Татнефть ао', ticker:'TATN', board:'TQBR', sector:'Нефть и газ', focus:'дивиденды'},
  {name:'Татнефть ап', ticker:'TATNP', board:'TQBR', sector:'Нефть и газ', focus:'спред к ао'},
  {name:'Сургутнефтегаз ап', ticker:'SNGSP', board:'TQBR', sector:'Нефть и газ', focus:'USD/RUB, дивиденды'},
  {name:'Норникель', ticker:'GMKN', board:'TQBR', sector:'Металлы', focus:'никель, палладий'},
  {name:'Северсталь', ticker:'CHMF', board:'TQBR', sector:'Металлургия', focus:'сталь, дивиденды'},
  {name:'ММК', ticker:'MAGN', board:'TQBR', sector:'Металлургия', focus:'внутренний спрос'},
  {name:'Мосбиржа', ticker:'MOEX', board:'TQBR', sector:'Финансы', focus:'обороты торгов'},
  {name:'ВТБ', ticker:'VTBR', board:'TQBR', sector:'Финансы', focus:'капитал, ставка'},
  {name:'Полюс', ticker:'PLZL', board:'TQBR', sector:'Золото', focus:'золото, рубль'},
  {name:'Алроса', ticker:'ALRS', board:'TQBR', sector:'Добыча', focus:'экспорт, спрос'},
  {name:'Интер РАО', ticker:'IRAO', board:'TQBR', sector:'Энергетика', focus:'тарифы'},
  {name:'РусГидро', ticker:'HYDR', board:'TQBR', sector:'Энергетика', focus:'госновости'},
  {name:'ФосАгро', ticker:'PHOR', board:'TQBR', sector:'Химия', focus:'удобрения'},
  {name:'Магнит', ticker:'MGNT', board:'TQBR', sector:'Ритейл', focus:'инфляция'},
  {name:'Ozon', ticker:'OZON', board:'TQBR', sector:'E-commerce', focus:'GMV, маржа'}
];

const COMMODITIES = [
  { key:'gold', name:'Золото', code:'GLDRUB_TOM', engine:'currency', market:'selt', board:'CETS', unit:'RUB/г' },
  { key:'silver', name:'Серебро', code:'SLVRUB_TOM', engine:'currency', market:'selt', board:'CETS', unit:'RUB/г' },
  { key:'platinum', name:'Платина', code:'PLTRUB_TOM', engine:'currency', market:'selt', board:'CETS', unit:'RUB/г' },
  { key:'palladium', name:'Палладий', code:'PLDRUB_TOM', engine:'currency', market:'selt', board:'CETS', unit:'RUB/г' }
];

const state = {
  candlesData: [],
  intradayData: [],
  priceChart: null,
  volumeChart: null,
  intradayChart: null,
  commodityChart: null,
  commodityCards: {},
  activeCommodityKey: 'gold',
  refreshTimer: null,
  currentTicker: 'ROSN',
  requestSeq: 0,
  activeRequestSeq: 0,
  reportMetaCache: {},
  reportMetaSeq: 0,
  user: null,
};

const hoverGuideLinePlugin = {
  id: 'hoverGuideLine',
  afterDatasetsDraw(chart) {
    const active = chart?.tooltip?._active || [];
    const area = chart?.chartArea;
    if (!active.length || !area) return;
    const activePoint = active[0]?.element;
    if (!activePoint) return;
    const { ctx } = chart;
    const x = activePoint.x;
    const y = activePoint.y;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.right, y);
    ctx.stroke();
    ctx.restore();
  }
};

if (window.Chart && !Chart.registry.plugins.get('hoverGuideLine')) {
  Chart.register(hoverGuideLinePlugin);
}

const $ = (id) => document.getElementById(id);

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = isJson ? payload.error || payload.message || 'Ошибка запроса' : String(payload || 'Ошибка запроса');
    throw new Error(message);
  }

  return payload;
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setDefaultDates() {
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(now.getDate() - 30);
  $('fromDate').value = toDateInputValue(monthAgo);
  $('tillDate').value = toDateInputValue(now);
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}
function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU');
}
function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function safeNumber(value, digits = 4) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}
function formatInt(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}
function formatCompactDate(value) {
  return value instanceof Date ? value.toLocaleDateString('ru-RU') : formatDate(value);
}
function monthLabel(date) {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}
function computeMovingAverage(data, period = 5) {
  return data.map((_, idx) => {
    if (idx < period - 1) return null;
    const slice = data.slice(idx - period + 1, idx + 1);
    const avg = slice.reduce((sum, item) => sum + Number(item.close || 0), 0) / period;
    return Number(avg.toFixed(4));
  });
}

function fillCompanySelectors() {
  $('companySelect').innerHTML = COMPANIES.map(c => `<option value="${c.ticker}">${c.name} (${c.ticker})</option>`).join('');
  $('companySelect').value = state.currentTicker;
  renderWatchlist();
  updateSelectedCompanyUI();
}

function selectedCompany() {
  const ticker = $('companySelect').value || state.currentTicker || 'ROSN';
  state.currentTicker = ticker;
  return COMPANIES.find(c => c.ticker === ticker) || COMPANIES[0];
}

function setSelectedCompany(ticker) {
  const company = COMPANIES.find(c => c.ticker === ticker) || COMPANIES[0];
  state.currentTicker = company.ticker;
  $('companySelect').value = company.ticker;
  updateSelectedCompanyUI();
}

function updateSelectedCompanyUI() {
  const company = selectedCompany();
  $('pageTitle').textContent = `${company.ticker} · ${company.name}`;
  $('pageSubtitle').textContent = `Отдельное приложение с входом через Google, серверным API-прокси MOEX, онлайн-графиком за сегодня, драгоценными металлами и Excel-отчётами. Сектор: ${company.sector}. Фокус: ${company.focus}.`;
  $('apiStatusNote').textContent = `Выбрана компания: ${company.name} (${company.ticker}).`;
  document.querySelectorAll('#watchlistBody tr').forEach(row => row.classList.remove('active-company'));
  const activeRow = document.querySelector(`#watchlistBody tr[data-ticker="${company.ticker}"]`);
  if (activeRow) activeRow.classList.add('active-company');
}

function renderWatchlist() {
  $('watchlistBody').innerHTML = COMPANIES.map(company => `
    <tr class="click-row" data-ticker="${company.ticker}">
      <td><b>${company.ticker}</b></td>
      <td>${company.name}</td>
      <td>${company.sector}</td>
      <td>${company.focus}</td>
    </tr>
  `).join('');

  document.querySelectorAll('#watchlistBody tr').forEach(row => {
    row.addEventListener('click', () => {
      setSelectedCompany(row.dataset.ticker);
      updateReportPeriodSelectors();
      loadData();
    });
  });
}

function updateMarketStatus() {
  const now = new Date();
  const moscowNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const day = moscowNow.getDay();
  const minutes = moscowNow.getHours() * 60 + moscowNow.getMinutes();
  const isWorkday = day >= 1 && day <= 5;
  const open = 9 * 60 + 50;
  const close = 18 * 60 + 50;
  const badge = $('marketStatusBadge');
  if (isWorkday && minutes >= open && minutes <= close) {
    badge.textContent = 'Статус сессии: рынок открыт';
    badge.className = 'badge good';
  } else if (isWorkday) {
    badge.textContent = 'Статус сессии: вне основной сессии';
    badge.className = 'badge warn';
  } else {
    badge.textContent = 'Статус сессии: выходной';
    badge.className = 'badge';
  }
}

function buildMoexQuery(paramsObj) {
  const params = new URLSearchParams();
  Object.entries(paramsObj).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

async function fetchMarketCandles({ engine, market, board, security, from, till, interval }) {
  const query = buildMoexQuery({ engine, market, board, security, from, till, interval });
  const result = await apiFetch(`/api/moex/candles?${query}`);
  return Array.isArray(result.data) ? result.data : [];
}

async function fetchMoexCandles(company, from, till, interval, options = {}) {
  const data = await fetchMarketCandles({
    engine: 'stock',
    market: 'shares',
    board: company.board,
    security: company.ticker,
    from,
    till,
    interval
  });
  if (!options.silent) $('apiStatusNote').textContent = `Данные ${company.ticker} загружены через сервер приложения.`;
  return data;
}

async function fetchCommodityCandles(spec, from, till, interval = '24') {
  return fetchMarketCandles({
    engine: spec.engine,
    market: spec.market,
    board: spec.board,
    security: spec.code,
    from,
    till,
    interval
  });
}

function aggregateWeekly(data) {
  const map = new Map();
  data.forEach(item => {
    const d = new Date(item.begin);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const key = monday.toISOString();
    if (!map.has(key)) {
      map.set(key, {
        begin: item.begin,
        end: item.end,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: Number(item.volume || 0),
        value: Number(item.value || 0)
      });
      return;
    }
    const agg = map.get(key);
    agg.end = item.end;
    agg.high = Math.max(Number(agg.high || 0), Number(item.high || 0));
    agg.low = Math.min(Number(agg.low ?? item.low), Number(item.low || 0));
    agg.close = item.close;
    agg.volume += Number(item.volume || 0);
    agg.value += Number(item.value || 0);
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.begin) - new Date(b.begin));
}

function destroyCharts() {
  if (state.priceChart) state.priceChart.destroy();
  if (state.volumeChart) state.volumeChart.destroy();
  if (state.intradayChart) state.intradayChart.destroy();
  state.priceChart = null;
  state.volumeChart = null;
  state.intradayChart = null;
}

function destroyCommodityChart() {
  if (state.commodityChart) state.commodityChart.destroy();
  state.commodityChart = null;
}

function renderStats(data) {
  if (!data.length) {
    $('lastPrice').textContent = '—';
    $('lastPriceMeta').textContent = 'Нет данных';
    $('priceChange').textContent = '—';
    $('priceChangePct').textContent = '—';
    $('avgPrice').textContent = '—';
    $('totalVolume').textContent = '—';
    return;
  }

  const first = data[0];
  const last = data[data.length - 1];
  const closes = data.map(item => Number(item.close || 0));
  const volumes = data.map(item => Number(item.volume || 0));
  const change = Number(last.close) - Number(first.close);
  const changePctValue = Number(first.close) ? (change / Number(first.close)) * 100 : 0;
  const avg = closes.reduce((sum, value) => sum + value, 0) / closes.length;
  const volumeSum = volumes.reduce((sum, value) => sum + value, 0);

  $('lastPrice').textContent = safeNumber(last.close);
  $('lastPriceMeta').textContent = `Последняя свеча: ${formatDateTime(last.begin)} — ${formatDateTime(last.end)}`;
  $('priceChange').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(4)}`;
  $('priceChange').className = `stat-value ${change >= 0 ? 'up' : 'down'}`;
  $('priceChangePct').textContent = `${changePctValue >= 0 ? '+' : ''}${changePctValue.toFixed(2)}% к первой свече`;
  $('priceChangePct').className = `small ${changePctValue >= 0 ? 'up' : 'down'}`;
  $('avgPrice').textContent = avg.toFixed(4);
  $('totalVolume').textContent = formatInt(volumeSum);
}

function renderHistoryCharts(data) {
  const labels = data.map(item => formatDateTime(item.begin));
  const closes = data.map(item => Number(item.close || 0));
  const volumes = data.map(item => Number(item.volume || 0));
  const ma5 = computeMovingAverage(data, 5);

  state.priceChart = new Chart($('priceChart').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Цена закрытия', data: closes, borderWidth: 2, tension: 0.2 },
        { label: 'MA(5)', data: ma5, borderWidth: 2, tension: 0.2, borderDash: [6, 5], pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        hoverGuideLine: {},
        tooltip: { callbacks: { title: items => items[0]?.label || '' } }
      },
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } } }
    }
  });

  state.volumeChart = new Chart($('volumeChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Объём', data: volumes, borderWidth: 1, borderRadius: 5 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        hoverGuideLine: {},
        tooltip: { callbacks: { title: items => items[0]?.label || '' } }
      },
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } } }
    }
  });
}

function renderIntraday(data) {
  if (!data.length) {
    $('intradayHint').textContent = 'За сегодня нет внутридневных свечей.';
    ['dayOpen','dayHigh','dayLow','dayLast','dayMove','dayRange','dayBars','lastUpdate'].forEach(id => $(id).textContent = '—');
    return;
  }

  const labels = data.map(item => formatTime(item.begin));
  const closes = data.map(item => Number(item.close || 0));
  const first = data[0];
  const last = data[data.length - 1];
  const highs = data.map(item => Number(item.high || 0));
  const lows = data.map(item => Number(item.low || 0));
  const dayHigh = Math.max(...highs);
  const dayLow = Math.min(...lows);
  const baseline = Number(first.open || first.close || 0);
  const move = Number(last.close) - baseline;
  const movePct = baseline ? (move / baseline) * 100 : 0;
  const rangePct = dayLow ? ((dayHigh - dayLow) / dayLow) * 100 : 0;

  state.intradayChart = new Chart($('intradayChart').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Цена сегодня',
        data: closes,
        borderWidth: 2,
        tension: 0.15,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        hoverGuideLine: {},
        tooltip: {
          callbacks: {
            title: items => items[0]?.label || '',
            label: item => `Цена: ${safeNumber(item.raw)}`
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 16 } },
        y: { ticks: { callback: value => Number(value).toFixed(2) } }
      }
    }
  });

  $('intradayHint').textContent = `Онлайн-график за текущий день по ${selectedCompany().ticker}. Последняя свеча: ${formatTime(last.begin)}.`;
  $('dayOpen').textContent = safeNumber(first.open || first.close);
  $('dayHigh').textContent = safeNumber(dayHigh);
  $('dayLow').textContent = safeNumber(dayLow);
  $('dayLast').textContent = safeNumber(last.close);
  $('dayMove').textContent = `${move >= 0 ? '+' : ''}${move.toFixed(4)} (${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%)`;
  $('dayMove').className = `value ${move >= 0 ? 'up' : 'down'}`;
  $('dayRange').textContent = `${(dayHigh - dayLow).toFixed(4)} / ${rangePct.toFixed(2)}%`;
  $('dayBars').textContent = String(data.length);
  $('lastUpdate').textContent = new Date().toLocaleTimeString('ru-RU');
}

function renderTable(data) {
  if (!data.length) {
    $('candlesTableBody').innerHTML = '<tr><td colspan="10">Нет данных</td></tr>';
    return;
  }

  $('candlesTableBody').innerHTML = data.map((item, index) => {
    const prev = data[index - 1];
    const changePct = prev ? ((Number(item.close) - Number(prev.close)) / (Number(prev.close) || 1)) * 100 : null;
    const vwap = item.value ? Number(item.value) / Math.max(Number(item.volume || 1), 1) : null;
    return `
      <tr>
        <td>${formatDate(item.begin)}</td>
        <td>${formatTime(item.begin)}</td>
        <td>${formatTime(item.end)}</td>
        <td>${safeNumber(item.open)}</td>
        <td>${safeNumber(item.high)}</td>
        <td>${safeNumber(item.low)}</td>
        <td>${safeNumber(item.close)}</td>
        <td>${formatInt(item.volume)}</td>
        <td>${vwap === null ? '—' : safeNumber(vwap)}</td>
        <td class="${changePct === null ? '' : changePct >= 0 ? 'up' : 'down'}">${changePct === null ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`}</td>
      </tr>`;
  }).join('');
}

function renderCommodityCards() {
  $('commodityCards').innerHTML = COMMODITIES.map(spec => {
    const data = state.commodityCards[spec.key];
    if (!data || !data.latest) {
      return `
        <div class="commodity-card ${state.activeCommodityKey === spec.key ? 'active' : ''}" data-commodity="${spec.key}">
          <div class="commodity-name">${spec.name}</div>
          <div class="commodity-price">—</div>
          <div class="commodity-meta">Нет данных</div>
        </div>`;
    }

    const latest = data.latest;
    const prev = data.prev;
    const change = prev ? Number(latest.close || 0) - Number(prev.close || 0) : null;
    const changePct = prev && Number(prev.close || 0) ? (change / Number(prev.close || 0)) * 100 : null;

    return `
      <div class="commodity-card ${state.activeCommodityKey === spec.key ? 'active' : ''}" data-commodity="${spec.key}">
        <div class="commodity-name">${spec.name}</div>
        <div class="commodity-price">${safeNumber(latest.close, 2)}</div>
        <div class="commodity-meta">${spec.code} · ${spec.unit}<br>${change === null ? 'Первое значение' : `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`}<br>${formatDate(latest.begin)}</div>
      </div>`;
  }).join('');

  document.querySelectorAll('#commodityCards .commodity-card').forEach(card => {
    card.addEventListener('click', () => {
      state.activeCommodityKey = card.dataset.commodity;
      renderCommodityCards();
      renderCommodityChart();
    });
  });
}

function renderCommodityChart() {
  const spec = COMMODITIES.find(item => item.key === state.activeCommodityKey) || COMMODITIES[0];
  const history = state.commodityCards[spec.key]?.history || [];
  destroyCommodityChart();

  if (!history.length) {
    $('commodityStatusNote').textContent = `Нет исторических данных для ${spec.name}.`;
    return;
  }

  state.commodityChart = new Chart($('commodityChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: history.map(item => formatDate(item.begin)),
      datasets: [{
        label: `${spec.name} · ${spec.unit}`,
        data: history.map(item => Number(item.close || 0)),
        borderWidth: 2,
        tension: 0.2,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        hoverGuideLine: {},
        tooltip: {
          callbacks: {
            title: items => items[0]?.label || '',
            label: item => `Цена: ${safeNumber(item.raw, 2)} ${spec.unit}`
          }
        }
      },
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } } }
    }
  });

  const latest = state.commodityCards[spec.key]?.latest;
  $('commodityStatusNote').textContent = latest
    ? `${spec.name}: последняя доступная цена ${safeNumber(latest.close, 2)} ${spec.unit}. История за 30 дней.`
    : `${spec.name}: история за 30 дней.`;
}

async function loadCommodityData() {
  const button = $('reloadCommoditiesBtn');
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 30);
  const from = toDateInputValue(start);
  const till = toDateInputValue(end);

  try {
    button.disabled = true;
    button.textContent = 'Обновление...';
    $('commodityStatusNote').textContent = 'Загружаю цены на драгоценные металлы...';

    const results = await Promise.all(COMMODITIES.map(async spec => {
      try {
        const history = await fetchCommodityCandles(spec, from, till, '24');
        return { key: spec.key, history };
      } catch (error) {
        return { key: spec.key, history: [] };
      }
    }));

    results.forEach(result => {
      const history = result.history || [];
      state.commodityCards[result.key] = {
        history,
        latest: history.length ? history[history.length - 1] : null,
        prev: history.length > 1 ? history[history.length - 2] : null
      };
    });

    if (!state.commodityCards[state.activeCommodityKey]?.history?.length) {
      const firstAvailable = results.find(item => (item.history || []).length);
      if (firstAvailable) state.activeCommodityKey = firstAvailable.key;
    }

    renderCommodityCards();
    renderCommodityChart();
  } catch (error) {
    $('commodityStatusNote').textContent = error.message || 'Не удалось загрузить цены на драгоценные металлы.';
  } finally {
    button.disabled = false;
    button.textContent = 'Обновить сырьевые цены';
  }
}

function parseIsoDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function getMonday(date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}
function getSunday(date) {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}
function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

async function detectFirstTradeDate(company) {
  if (state.reportMetaCache[company.ticker]?.firstTradeDate) {
    return state.reportMetaCache[company.ticker].firstTradeDate;
  }

  const query = buildMoexQuery({ board: company.board, security: company.ticker });
  const payload = await apiFetch(`/api/moex/first-trade?${query}`);
  const firstTradeDate = payload.firstTradeDate || '2000-01-01';
  state.reportMetaCache[company.ticker] = state.reportMetaCache[company.ticker] || {};
  state.reportMetaCache[company.ticker].firstTradeDate = firstTradeDate;
  return firstTradeDate;
}

function buildWeekOptions(firstTradeDate) {
  const today = new Date();
  const first = parseIsoDate(firstTradeDate);
  const options = [];

  let start = new Date(first);
  let end = getSunday(start);
  options.push({
    value: `${toDateInputValue(start)}|${toDateInputValue(end)}`,
    label: `${formatCompactDate(start)} — ${formatCompactDate(end)} · первая неделя торгов`
  });

  start = new Date(end);
  start.setDate(start.getDate() + 1);
  start = getMonday(start);

  while (start <= today) {
    end = getSunday(start);
    const isCurrentWeek = today >= start && today <= end;
    options.push({
      value: `${toDateInputValue(start)}|${toDateInputValue(end)}`,
      label: `${formatCompactDate(start)} — ${formatCompactDate(end)}${isCurrentWeek ? ' · текущая неделя' : ''}`
    });
    start = new Date(end);
    start.setDate(start.getDate() + 1);
    start = getMonday(start);
  }

  return options.reverse();
}

function buildMonthOptions(firstTradeDate) {
  const today = new Date();
  const first = parseIsoDate(firstTradeDate);
  const options = [];

  let start = new Date(first);
  let end = getMonthEnd(start);
  options.push({
    value: `${toDateInputValue(start)}|${toDateInputValue(end)}`,
    label: `${monthLabel(start)} · с ${formatCompactDate(start)} по ${formatCompactDate(end)}`
  });

  start = new Date(end.getFullYear(), end.getMonth() + 1, 1);
  while (start <= today) {
    end = getMonthEnd(start);
    const isCurrentMonth = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();
    options.push({
      value: `${toDateInputValue(start)}|${toDateInputValue(end)}`,
      label: `${monthLabel(start)} · ${formatCompactDate(start)} — ${formatCompactDate(end)}${isCurrentMonth ? ' · текущий месяц' : ''}`
    });
    start = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }

  return options.reverse();
}

function fillPeriodSelect(selectId, options, placeholder) {
  const select = $(selectId);
  if (!options.length) {
    select.innerHTML = `<option value="">${placeholder}</option>`;
    return;
  }
  select.innerHTML = options.map(item => `<option value="${item.value}">${item.label}</option>`).join('');
}

async function updateReportPeriodSelectors() {
  const company = selectedCompany();
  const seq = ++state.reportMetaSeq;
  $('reportWeekSelect').innerHTML = '<option value="">Загрузка недель...</option>';
  $('reportMonthSelect').innerHTML = '<option value="">Загрузка месяцев...</option>';
  $('reportPeriodsInfo').textContent = `Собираю доступные недели и месяцы для ${company.name} (${company.ticker})...`;

  try {
    let cache = state.reportMetaCache[company.ticker];
    if (!cache?.weeks || !cache?.months) {
      const firstTradeDate = await detectFirstTradeDate(company);
      if (seq !== state.reportMetaSeq) return;
      const weeks = buildWeekOptions(firstTradeDate);
      const months = buildMonthOptions(firstTradeDate);
      cache = { firstTradeDate, weeks, months };
      state.reportMetaCache[company.ticker] = cache;
    }

    if (seq !== state.reportMetaSeq) return;
    fillPeriodSelect('reportWeekSelect', cache.weeks, 'Нет недель для выбора');
    fillPeriodSelect('reportMonthSelect', cache.months, 'Нет месяцев для выбора');
    $('reportPeriodsInfo').textContent = `Периоды для ${company.name}: с ${formatCompactDate(cache.firstTradeDate)} доступно ${cache.weeks.length} недель и ${cache.months.length} месяцев.`;
  } catch (error) {
    if (seq !== state.reportMetaSeq) return;
    $('reportWeekSelect').innerHTML = '<option value="">Не удалось загрузить недели</option>';
    $('reportMonthSelect').innerHTML = '<option value="">Не удалось загрузить месяцы</option>';
    $('reportPeriodsInfo').textContent = `Не удалось получить периоды для ${company.ticker}.`; 
  }
}

function getSelectedReportRange(periodType) {
  const selectId = periodType === 'weekly' ? 'reportWeekSelect' : 'reportMonthSelect';
  const value = $(selectId).value;
  if (!value || !value.includes('|')) return null;
  const [start, end] = value.split('|');
  return { start, end };
}

function buildSimpleReportRows(data) {
  return data.map((item, index) => {
    const prev = data[index - 1];
    const close = Number(item.close || 0);
    const prevClose = prev ? Number(prev.close || 0) : null;
    const change = prevClose === null ? null : close - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : null;
    return {
      date: formatDate(item.begin),
      close: safeNumber(close),
      change: change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(4)}`,
      changePct: changePct === null ? '—' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
      changeClass: change === null ? '' : change >= 0 ? 'up' : 'down',
      volume: formatInt(item.volume)
    };
  });
}

function renderSimpleReportPreview(rows) {
  $('simpleReportsBody').innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.close}</td>
      <td class="${r.changeClass}">${r.change}</td>
      <td class="${r.changeClass}">${r.changePct}</td>
      <td>${r.volume}</td>
    </tr>
  `).join('') : '<tr><td colspan="5">Нет данных для отчёта</td></tr>';
}

function buildReportWorkbook(company, periodType, rows, periodRange) {
  const labelMap = { weekly: 'Weekly', monthly: 'Monthly' };
  const titleMap = { weekly: 'Недельный отчёт', monthly: 'Месячный отчёт' };
  const wb = XLSX.utils.book_new();
  const metaRows = [
    ['Отчёт', titleMap[periodType]],
    ['Компания', `${company.name} (${company.ticker})`],
    ['Период', `${periodRange.start} — ${periodRange.end}`],
    ['Сформирован', new Date().toLocaleString('ru-RU')],
    [],
    ['Дата', 'Закрытие', 'Изм. к прошлому дню', 'Изм. %', 'Объём']
  ];
  const dataRows = rows.map(r => [r.date, r.close, r.change, r.changePct, r.volume]);
  const ws = XLSX.utils.aoa_to_sheet(metaRows.concat(dataRows));
  ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, `${labelMap[periodType]}_Daily_Close`);
  return wb;
}

async function downloadSelectedReport(periodType) {
  const company = selectedCompany();
  const periodRange = getSelectedReportRange(periodType);
  const button = $(periodType === 'weekly' ? 'downloadSelectedWeekBtn' : 'downloadSelectedMonthBtn');
  const originalText = button.textContent;

  if (!periodRange) {
    $('reportDownloadStatus').textContent = `Сначала выберите ${periodType === 'weekly' ? 'неделю' : 'месяц'} из списка.`;
    return;
  }

  try {
    button.disabled = true;
    button.textContent = 'Подготовка...';
    $('reportDownloadStatus').textContent = `Собираю ${periodType === 'weekly' ? 'недельный' : 'месячный'} отчёт по ${company.ticker}: ${periodRange.start} — ${periodRange.end}.`;
    const dailyData = await fetchMoexCandles(company, periodRange.start, periodRange.end, '24', { silent: true });
    const rows = buildSimpleReportRows(dailyData);
    renderSimpleReportPreview(rows);
    if (!rows.length) {
      $('reportDownloadStatus').textContent = 'Для выбранного периода нет данных для выгрузки.';
      return;
    }
    const wb = buildReportWorkbook(company, periodType, rows, periodRange);
    const filename = `${company.ticker}_${periodType}_${periodRange.start}_to_${periodRange.end}.xlsx`;
    XLSX.writeFile(wb, filename);
    $('reportDownloadStatus').textContent = `Excel-отчёт готов: ${filename}. Ниже — превью.`;
  } catch (error) {
    $('reportDownloadStatus').textContent = `Ошибка отчёта: ${error.message || 'не удалось сформировать Excel'}`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  if (!state.candlesData.length) {
    $('apiStatusNote').textContent = 'Сначала загрузите данные по выбранной компании.';
    return;
  }
  const company = selectedCompany();
  const headers = ['date','time_begin','time_end','open','high','low','close','volume','vwap'];
  const rows = state.candlesData.map(item => {
    const vwap = item.value ? Number(item.value) / Math.max(Number(item.volume || 1), 1) : '';
    return [
      formatDate(item.begin),
      formatTime(item.begin),
      formatTime(item.end),
      safeNumber(item.open),
      safeNumber(item.high),
      safeNumber(item.low),
      safeNumber(item.close),
      formatInt(item.volume),
      vwap === '' ? '' : safeNumber(vwap)
    ].join(';');
  });
  const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
  downloadFile(`${company.ticker}_${$('fromDate').value}_${$('tillDate').value}.csv`, csv, 'text/csv;charset=utf-8;');
}

function exportJson() {
  if (!state.candlesData.length) {
    $('apiStatusNote').textContent = 'Сначала загрузите данные по выбранной компании.';
    return;
  }
  const company = selectedCompany();
  const payload = {
    company,
    from: $('fromDate').value,
    till: $('tillDate').value,
    interval: $('intervalSelect').value,
    candles: state.candlesData,
    intraday: state.intradayData,
    exportedAt: new Date().toISOString()
  };
  downloadFile(`${company.ticker}_${$('fromDate').value}_${$('tillDate').value}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8;');
}

function exportWatchlist() {
  const headers = ['ticker','company','sector','focus'];
  const rows = COMPANIES.map(item => [item.ticker, item.name, item.sector, item.focus].join(';'));
  const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
  downloadFile('ru_market_watchlist.csv', csv, 'text/csv;charset=utf-8;');
}

async function loadData() {
  const requestSeq = ++state.requestSeq;
  state.activeRequestSeq = requestSeq;

  const company = selectedCompany();
  const from = $('fromDate').value;
  const till = $('tillDate').value;
  const interval = $('intervalSelect').value;
  updateSelectedCompanyUI();

  try {
    $('loadBtn').disabled = true;
    $('loadBtn').textContent = 'Загрузка...';

    let candles;
    if (interval === '7') {
      const daily = await fetchMoexCandles(company, from, till, '24');
      if (requestSeq !== state.activeRequestSeq) return;
      candles = aggregateWeekly(daily);
    } else {
      candles = await fetchMoexCandles(company, from, till, interval);
      if (requestSeq !== state.activeRequestSeq) return;
    }

    const today = toDateInputValue(new Date());
    const intraday = await fetchMoexCandles(company, today, today, '1', { silent: true });
    if (requestSeq !== state.activeRequestSeq) return;

    state.candlesData = candles;
    state.intradayData = intraday;

    destroyCharts();
    renderStats(candles);
    renderHistoryCharts(candles);
    renderIntraday(intraday);
    renderTable(candles);
    $('apiStatusNote').textContent = `Данные ${company.name} (${company.ticker}) загружены.`;
  } catch (error) {
    if (requestSeq !== state.activeRequestSeq) return;
    state.candlesData = [];
    state.intradayData = [];
    destroyCharts();
    renderStats([]);
    renderIntraday([]);
    renderTable([]);
    $('lastPrice').textContent = 'Ошибка';
    $('lastPriceMeta').textContent = error.message || 'Не удалось загрузить данные';
    $('apiStatusNote').textContent = `Ошибка загрузки по ${company.name} (${company.ticker}): ${error.message || 'не удалось получить данные'}`;
  } finally {
    if (requestSeq === state.activeRequestSeq) {
      $('loadBtn').disabled = false;
      $('loadBtn').textContent = 'Загрузить данные';
    }
  }
}

function stopAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = null;
}

function setupAutoRefresh() {
  stopAutoRefresh();
  const intervalMs = Number($('refreshSelect').value);
  if (!intervalMs) return;
  state.refreshTimer = setInterval(loadData, intervalMs);
}

function showAuthOverlay() {
  $('authOverlay').style.display = 'flex';
}

function hideAuthOverlay() {
  $('authOverlay').style.display = 'none';
}

function enterApp(user) {
  state.user = user;
  $('currentUserBadge').textContent = `Пользователь: ${user.name || user.email}`;
  hideAuthOverlay();
  $('logoutBtn').style.display = 'inline-block';
  loadData();
  loadCommodityData();
  updateReportPeriodSelectors();
  setupAutoRefresh();
}

async function restoreSession() {
  try {
    const payload = await apiFetch('/api/me');
    if (payload?.authenticated && payload.user) {
      enterApp(payload.user);
      return true;
    }
  } catch (error) {
    // Игнорируем и показываем форму входа.
  }
  showAuthOverlay();
  $('currentUserBadge').textContent = 'Не авторизован';
  $('logoutBtn').style.display = 'none';
  return false;
}

async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error(error);
  }
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  state.user = null;
  stopAutoRefresh();
  showAuthOverlay();
  $('currentUserBadge').textContent = 'Не авторизован';
  $('logoutBtn').style.display = 'none';
  $('authStatus').textContent = 'Вы вышли из приложения.';
  await initGoogleSignIn();
}

async function waitForGoogleIdentity(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.google?.accounts?.id) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

async function handleGoogleCredentialResponse(response) {
  try {
    $('authStatus').textContent = 'Проверяю вход через Google...';
    const payload = await apiFetch('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential })
    });
    enterApp(payload.user);
    $('authStatus').textContent = '';
  } catch (error) {
    $('authStatus').textContent = error.message || 'Не удалось выполнить вход через Google.';
  }
}

async function initGoogleSignIn() {
  const clientId = window.APP_CONFIG?.googleClientId;
  const wrap = $('googleSignInWrap');
  wrap.innerHTML = '';

  if (!clientId) {
    $('authStatus').textContent = 'В серверных настройках не задан GOOGLE_CLIENT_ID.';
    return;
  }

  const gisLoaded = await waitForGoogleIdentity();
  if (!gisLoaded) {
    $('authStatus').textContent = 'Не удалось загрузить библиотеку Google Identity Services.';
    return;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredentialResponse,
    auto_select: false,
    ux_mode: 'popup'
  });

  window.google.accounts.id.renderButton(wrap, {
    theme: 'outline',
    size: 'large',
    text: 'signup_with',
    shape: 'rectangular',
    width: 320
  });

  $('authStatus').textContent = '';
}

function bindEvents() {
  $('logoutBtn').addEventListener('click', logout);
  $('loadBtn').addEventListener('click', loadData);
  $('refreshSelect').addEventListener('change', () => { setupAutoRefresh(); loadData(); });
  $('downloadCsvBtn').addEventListener('click', exportCsv);
  $('downloadJsonBtn').addEventListener('click', exportJson);
  $('downloadWatchlistBtn').addEventListener('click', exportWatchlist);
  $('companySelect').addEventListener('change', () => {
    setSelectedCompany($('companySelect').value);
    updateReportPeriodSelectors();
    loadData();
  });
  $('intervalSelect').addEventListener('change', loadData);
  $('fromDate').addEventListener('change', loadData);
  $('tillDate').addEventListener('change', loadData);
  $('downloadSelectedWeekBtn').addEventListener('click', () => downloadSelectedReport('weekly'));
  $('downloadSelectedMonthBtn').addEventListener('click', () => downloadSelectedReport('monthly'));
  $('reloadCommoditiesBtn').addEventListener('click', loadCommodityData);
}

async function initApp() {
  setDefaultDates();
  fillCompanySelectors();
  bindEvents();
  updateMarketStatus();
  setInterval(updateMarketStatus, 30000);
  const restored = await restoreSession();
  if (!restored) {
    await initGoogleSignIn();
  }
}

window.addEventListener('DOMContentLoaded', initApp);
