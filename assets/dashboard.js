(function () {
  var DATA = window.REPORT_DATA;
  if (!DATA) return;

  var DAY = 86400000;
  var UP = '#c0392b';
  var DOWN = '#1e8449';
  var THUMB_UP_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="#e0a80d"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59A1.99 1.99 0 0 0 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>';
  var THUMB_DOWN_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="#98a4ab"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>';

  function parseDate(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function dayDiff(a, b) {
    return Math.round((b.getTime() - a.getTime()) / DAY);
  }

  function calc(p) {
    var n = p.dates.length;
    var latest = parseDate(p.dates[n - 1]);
    var incep = parseDate(p.dates[0]);
    var days = dayDiff(incep, latest);
    var sinceAnn = (p.nav[n - 1] / p.nav[0] - 1) * 365 / days * 100;
    var todayPer = (p.nav[n - 1] - p.nav[n - 2]) * 10000;
    var windows = [7, 14, 30, 60, 90, 365].map(function (w) {
      var target = latest.getTime() - w * DAY;
      var idx = -1;
      for (var i = 0; i < n; i++) {
        if (parseDate(p.dates[i]).getTime() <= target) idx = i;
      }
      var fallback = false;
      if (idx < 0) {
        if (w === 365) {
          idx = 0;
          fallback = true;
        } else {
          return { days: w, per: null, ann: null, span: null, start: null, fallback: false };
        }
      }
      var span = dayDiff(parseDate(p.dates[idx]), latest);
      var ret = p.nav[n - 1] / p.nav[idx] - 1;
      return {
        days: w,
        per: (p.nav[n - 1] - p.nav[idx]) * 10000 / span,
        ann: ret * 365 / span * 100,
        span: span,
        start: p.dates[idx],
        fallback: fallback
      };
    });
    return {
      latestDate: p.dates[n - 1],
      latestNav: p.nav[n - 1],
      inception: p.dates[0],
      days: days,
      sinceAnn: sinceAnn,
      todayPer: todayPer,
      windows: windows
    };
  }

  var MODEL = DATA.products.map(function (p) {
    return { product: p, m: calc(p) };
  });

  // 每个产品逐日年化（按相邻净值日计算），首日为空
  DATA.products.forEach(function (p) {
    p.dailyAnn = p.nav.map(function (v, i) {
      if (i === 0) return null;
      return (v / p.nav[i - 1] - 1) * 365 * 100;
    });
  });

  window.DASHBOARD_METRICS = MODEL;

  // 当前选中的产品（顶部“覆盖产品”多选）
  var selectedIds = DATA.products.map(function (p) { return p.id; });
  var AGG = null;

  function selectedProducts() {
    return DATA.products.filter(function (p) { return selectedIds.indexOf(p.id) !== -1; });
  }

  // 多产品合计：按日期汇总每日万份收益，年化取当日有净值产品的均值
  function buildAggregate(products) {
    if (!products.length) return null;
    if (products.length === 1) return products[0];
    var sums = {}, counts = {}, annSums = {}, annCounts = {};
    products.forEach(function (p) {
      for (var i = 0; i < p.dates.length; i++) {
        var dt = p.dates[i];
        var v = p.per10k[i];
        if (v !== null && v !== undefined) {
          if (!(dt in sums)) { sums[dt] = 0; counts[dt] = 0; }
          sums[dt] += v;
          counts[dt] += 1;
        }
        var a = p.dailyAnn ? p.dailyAnn[i] : null;
        if (a !== null && a !== undefined) {
          if (!(dt in annSums)) { annSums[dt] = 0; annCounts[dt] = 0; }
          annSums[dt] += a;
          annCounts[dt] += 1;
        }
      }
    });
    var dates = Object.keys(sums).sort();
    return {
      id: 'agg',
      name: products.length + ' 款产品合计',
      short: products.length + ' 款产品',
      multi: true,
      dates: dates,
      per10k: dates.map(function (d) { return Math.round(sums[d] * 100) / 100; }),
      counts: dates.map(function (d) { return counts[d]; }),
      ann: dates.map(function (d) {
        return annCounts[d] ? Math.round(annSums[d] / annCounts[d] * 100) / 100 : null;
      }),
      latestDate: dates[dates.length - 1],
      inception: dates[0]
    };
  }

  function refreshAggregate() {
    AGG = buildAggregate(selectedProducts());
  }
  refreshAggregate();

  function isMulti() { return selectedProducts().length > 1; }

  function colorBy(v) {
    if (v === null || v === undefined) return 'muted';
    if (v > 0) return 'up';
    if (v < 0) return 'down';
    return 'flat';
  }

  function fmt2(v) {
    return v === null || v === undefined ? '—' : v.toFixed(2);
  }

  function fmtAnn(v) {
    return v === null || v === undefined ? '—' : v.toFixed(2) + '%';
  }

  function fmtNav(v) {
    return v.toFixed(6);
  }

  // 评分参数：市场利率基准（%，一年期定存参考），可自行调整
  var MARKET_RATE = 1.5;
  var RATE_TOP = 4.0;       // 收益分满分对应的年化
  var SD_FLOOR = 2.5;       // 稳健分归零对应的日万收标准差

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function std(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr), s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / arr.length);
  }

  function ratingOf(s) {
    if (s >= 7.5) return { text: '优秀', cls: 's-good' };
    if (s >= 6) return { text: '良好', cls: 's-ok' };
    if (s >= 4) return { text: '一般', cls: 's-mid' };
    return { text: '偏弱', cls: 's-weak' };
  }

  // 1–10 综合评分：全部按近一个月（30 日）表现考核
  function scoreFor(m, p, peerAvg30) {
    var a30 = m.windows[2].ann;
    if (a30 === null) return null;

    var marketScore = clamp((a30 - MARKET_RATE) / (RATE_TOP - MARKET_RATE) * 10, 0, 10);
    var peerScore = clamp(((a30 - peerAvg30) + 1) / 2 * 10, 0, 10);

    var recent = p.per10k.slice(-30).filter(function (v) { return v !== null && v !== undefined; });
    var stabilityScore = clamp((1 - std(recent) / SD_FLOOR) * 10, 0, 10);
    var trendScore = 5;
    if (recent.length >= 10) {
      var half = Math.floor(recent.length / 2);
      var prevHalf = recent.slice(0, half);
      var lastHalf = recent.slice(recent.length - half);
      trendScore = clamp(5 + (mean(lastHalf) - mean(prevHalf)) * 2.5, 0, 10);
    }

    var total = marketScore * 0.5 + peerScore * 0.2 + stabilityScore * 0.2 + trendScore * 0.1;
    return {
      score: Math.round(clamp(total, 1, 10) * 10) / 10,
      marketScore: marketScore,
      peerScore: peerScore,
      stabilityScore: stabilityScore,
      trendScore: trendScore
    };
  }

  /* ---------------- Module 1: 盈亏明细 ---------------- */
  var profitState = { key: 'today', dir: 'desc' };
  var profitMetric = 'all';
  var WINDOW_SORT = { w7: 0, w14: 1, w30: 2, w60: 3, w90: 4, w365: 5 };

  function profitSortValue(row, key) {
    var m = row.item.m;
    if (key === 'name') return row.item.product.name;
    if (key === 'nav') return m.latestNav;
    if (key === 'days') return m.days;
    if (key === 'since') return m.sinceAnn;
    if (key === 'today') return m.todayPer;
    if (key === 'score') return row.score ? row.score.score : null;
    if (key in WINDOW_SORT) return m.windows[WINDOW_SORT[key]].per;
    return null;
  }

  function renderProfitTable() {
    var tbody = document.getElementById('profit-body');
    if (!tbody) return;
    var activeModel = MODEL.filter(function (x) { return selectedIds.indexOf(x.product.id) !== -1; });
    var peerAvg30 = mean(activeModel.map(function (x) { return x.m.windows[2].ann; }).filter(function (v) { return v !== null; }));
    var rows = activeModel.map(function (item) {
      return { item: item, score: scoreFor(item.m, item.product, peerAvg30) };
    });
    if (profitState.key) {
      rows.sort(function (a, b) {
        var av = profitSortValue(a, profitState.key);
        var bv = profitSortValue(b, profitState.key);
        var dir = profitState.dir === 'asc' ? 1 : -1;
        if (profitState.key === 'name') {
          return String(av).localeCompare(String(bv), 'zh-Hans-CN') * dir;
        }
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (av - bv) * dir;
      });
    }

    var maxV = null, minV = null;
    rows.forEach(function (row) {
      var v = row.item.m.todayPer;
      if (v === null || v === undefined) return;
      if (maxV === null || v > maxV) maxV = v;
      if (minV === null || v < minV) minV = v;
    });

    var metricRows = profitMetric === 'all' ? ['per', 'ann'] : [profitMetric];
    var spanAttr = metricRows.length === 2 ? ' rowspan="2"' : '';

    var html = '';
    rows.forEach(function (row, i) {
      var item = row.item;
      var p = item.product;
      var m = item.m;
      var per = m.windows.map(function (w) { return w.per; });
      var ann = m.windows.map(function (w) { return w.ann; });
      var sc = row.score;
      var rating = sc ? ratingOf(sc.score) : null;
      var badge = '';
      var tv = m.todayPer;
      if (tv !== null && tv !== undefined && maxV !== minV) {
        if (Math.abs(tv - maxV) < 1e-9) badge = '<span class="rank-icon" title="今日万收最高">' + THUMB_UP_SVG + '</span>';
        else if (Math.abs(tv - minV) < 1e-9) badge = '<span class="rank-icon" title="今日万收最低">' + THUMB_DOWN_SVG + '</span>';
      }

      var common = '';
      common += '<td' + spanAttr + ' class="idx-cell">' + (i + 1) + '</td>';
      common += '<td' + spanAttr + ' class="name-cell"><span class="p-name" title="' + p.name + '">' + p.name + '</span><span class="p-code">' + p.regCode + '</span></td>';
      common += '<td' + spanAttr + ' class="num">' + fmtNav(m.latestNav) + '<span class="sub">' + m.latestDate + '</span></td>';
      common += '<td' + spanAttr + ' class="num">' + m.days + '天<span class="sub">' + m.inception + '</span></td>';
      common += '<td' + spanAttr + ' class="num ' + colorBy(m.sinceAnn) + '">' + fmtAnn(m.sinceAnn) + '</td>';
      common += '<td' + spanAttr + ' class="num today-col ' + colorBy(m.todayPer) + '">' + fmt2(m.todayPer) + badge + '</td>';

      var perRow = '<td class="row-label">日均万收</td>';
      per.forEach(function (v, wi) {
        var w = m.windows[wi];
        var mark = w.fallback ? '<sup class="dag">†</sup>' : '';
        var tip = v === null ? '历史区间不足' : w.per.toFixed(4) + ' 元 / 万份（' + w.start + ' 至 ' + m.latestDate + '，' + w.span + ' 天）' + (w.fallback ? '；成立不足 1 年，按成立以来计算' : '');
        perRow += '<td class="num ' + colorBy(v) + '" title="' + tip + '">' + fmt2(v) + mark + '</td>';
      });

      var annRow = '<td class="row-label">年化</td>';
      ann.forEach(function (v, wi) {
        var w = m.windows[wi];
        var mark = w.fallback ? '<sup class="dag">†</sup>' : '';
        var tip = v === null ? '历史区间不足' : w.ann.toFixed(4) + '%（' + w.start + ' 至 ' + m.latestDate + '，按 ' + w.span + ' 天年化）' + (w.fallback ? '；成立不足 1 年，按成立以来计算' : '');
        annRow += '<td class="num ' + colorBy(v) + '" title="' + tip + '">' + fmtAnn(v) + mark + '</td>';
      });

      var scoreCell = '';
      if (sc) {
        var tip2 = '市场利率 ' + MARKET_RATE.toFixed(1) + '% · 收益 ' + sc.marketScore.toFixed(1) +
          ' / 同类 ' + sc.peerScore.toFixed(1) + ' / 稳健 ' + sc.stabilityScore.toFixed(1) +
          ' / 趋势 ' + sc.trendScore.toFixed(1);
        scoreCell = '<td' + spanAttr + ' class="score-cell" title="' + tip2 + '"><span class="score-num ' + rating.cls + '">' + sc.score.toFixed(1) + '</span><span class="score-tag">' + rating.text + '</span></td>';
      } else {
        scoreCell = '<td' + spanAttr + ' class="score-cell"><span class="score-num s-mid">—</span></td>';
      }

      html += '<tr class="p-row">' + common;
      html += metricRows[0] === 'per' ? perRow : annRow;
      html += scoreCell;
      if (metricRows.length === 2) {
        html += '</tr><tr class="p-row-2">' + (metricRows[1] === 'per' ? perRow : annRow) + '</tr>';
      } else {
        html += '</tr>';
      }
    });
    tbody.innerHTML = html || '<tr><td colspan="14" class="empty-row">未选择产品，请在顶部「覆盖产品」中选择</td></tr>';

    var ths = document.querySelectorAll('.profit-table thead th[data-sort]');
    Array.prototype.forEach.call(ths, function (th) {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.getAttribute('data-sort') === profitState.key) {
        th.classList.add(profitState.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });

    var total = rows.reduce(function (s, x) { return s + x.item.m.todayPer; }, 0);
    var heroEl = document.getElementById('hero-total');
    if (heroEl) {
      heroEl.textContent = rows.length ? total.toFixed(2) : '—';
      heroEl.className = 'hero-value ' + (rows.length ? colorBy(total) : '');
    }
  }

  /* ---------------- Module 2: 万收日历 ---------------- */
  var calState = { y: 0, m: 0 };

  function bindProfitSort() {
    var ths = document.querySelectorAll('.profit-table thead th[data-sort]');
    Array.prototype.forEach.call(ths, function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (profitState.key === key) {
          profitState.dir = profitState.dir === 'asc' ? 'desc' : 'asc';
        } else {
          profitState.key = key;
          profitState.dir = 'desc';
        }
        renderProfitTable();
      });
    });
  }

  function bindDataFilter() {
    var sel = document.getElementById('data-filter');
    if (!sel) return;
    sel.value = profitMetric;
    sel.addEventListener('change', function () {
      profitMetric = sel.value;
      renderProfitTable();
    });
  }

  function getModel(pid) {
    for (var i = 0; i < MODEL.length; i++) {
      if (MODEL[i].product.id === pid) return MODEL[i];
    }
    return MODEL[0];
  }

  // 默认展示最新净值所在月份
  function latestMonthFor(p) {
    var d = parseDate(p.latestDate);
    return { y: d.getFullYear(), m: d.getMonth() };
  }

  function perMap(p) {
    var map = {};
    for (var i = 0; i < p.dates.length; i++) {
      if (p.per10k[i] !== null) map[p.dates[i]] = p.per10k[i];
    }
    return map;
  }

  // 选择变化后把日历重置到该组产品的最新净值月份
  function resetCalendarMonth() {
    var dm = latestMonthFor({ latestDate: AGG ? AGG.latestDate : DATA.asOf });
    calState.y = dm.y;
    calState.m = dm.m;
  }

  function renderCalendar() {
    var wrap = document.getElementById('calendar');
    if (!wrap) return;
    var p = AGG;
    var map = p ? perMap(p) : {};
    var dates = p ? p.dates : [];
    var hasMonth = {};
    dates.forEach(function (dt) { hasMonth[dt.slice(0, 7)] = true; });

    var first = new Date(calState.y, calState.m, 1);
    var lastDay = new Date(calState.y, calState.m + 1, 0).getDate();
    var offset = (first.getDay() + 6) % 7;

    renderCalSelects(hasMonth);

    var cells = [];
    var weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    weekdays.forEach(function (w) {
      cells.push('<div class="cal-week">' + w + '</div>');
    });
    for (var b = 0; b < offset; b++) cells.push('<div class="cal-cell empty"></div>');

    var monthPrefix = calState.y + '-' + String(calState.m + 1).padStart(2, '0') + '-';
    var defined = [];
    for (var d = 1; d <= lastDay; d++) {
      var mv = map[monthPrefix + String(d).padStart(2, '0')];
      if (mv !== undefined) defined.push(mv);
    }
    var maxV = defined.length ? Math.max.apply(null, defined) : null;

    var pos = 0, neg = 0, flat = 0;
    var todayStr = DATA.asOf;
    for (var d2 = 1; d2 <= lastDay; d2++) {
      var dateStr2 = monthPrefix + String(d2).padStart(2, '0');
      var v = map[dateStr2];
      var cls = 'cal-cell';
      if (v === undefined) cls += ' nodata';
      if (dateStr2 === todayStr) cls += ' today';
      var badge = (v !== undefined && maxV !== null && Math.abs(v - maxV) < 1e-9)
        ? '<span class="cal-badge" title="当月最高万收">' + THUMB_UP_SVG + '</span>'
        : '';
      var valHtml = v === undefined
        ? '<span class="cal-val">—</span>'
        : '<span class="cal-val" style="color:' + (v > 0 ? '#b03123' : v < 0 ? '#1a6b3c' : '#5d6b76') + ';">' + v.toFixed(2) + badge + '</span>';
      cells.push('<div class="' + cls + '"><span class="cal-day">' + d2 + '</span>' + valHtml + '</div>');
      if (v !== undefined) {
        if (v > 0.005) pos++;
        else if (v < -0.005) neg++;
        else flat++;
      }
    }
    wrap.innerHTML = cells.join('');

    var summary = document.getElementById('cal-summary');
    if (summary) {
      var html = '<span class="sum-item">正收益 <strong class="up">' + pos + '</strong> 天</span>';
      html += '<span class="sum-item">回撤 <strong class="down">' + neg + '</strong> 天</span>';
      html += '<span class="sum-item">挂0 <strong class="flat">' + flat + '</strong> 天</span>';
      summary.innerHTML = html;
    }
  }

  // 年份下拉 + 月份左右切换；标题与按钮状态随年月更新
  function renderCalSelects(hasMonth) {
    var ySel = document.getElementById('cal-year');
    if (ySel) {
      var years = [];
      Object.keys(hasMonth).forEach(function (k) {
        var y = +k.slice(0, 4);
        if (years.indexOf(y) === -1) years.push(y);
      });
      years.sort(function (a, b) { return a - b; });
      if (!years.length) years = [calState.y];

      var yHtml = '';
      years.forEach(function (y) {
        yHtml += '<option value="' + y + '">' + y + '年</option>';
      });
      ySel.innerHTML = yHtml;
      ySel.value = String(calState.y);
    }

    var title = document.getElementById('cal-title');
    if (title) title.textContent = calState.y + '年' + (calState.m + 1) + '月';

    var range = calRange();
    var prev = document.getElementById('cal-prev');
    var next = document.getElementById('cal-next');
    if (prev) prev.disabled = !range || (calState.y === range.minY && calState.m === range.minM);
    if (next) next.disabled = !range || (calState.y === range.maxY && calState.m === range.maxM);
  }

  function calRange() {
    if (!AGG || !AGG.dates.length) return null;
    var d0 = parseDate(AGG.dates[0]);
    var d1 = parseDate(AGG.dates[AGG.dates.length - 1]);
    return {
      minY: d0.getFullYear(), minM: d0.getMonth(),
      maxY: d1.getFullYear(), maxM: d1.getMonth()
    };
  }

  function availableMonths(y) {
    var out = [];
    if (!AGG) return out;
    AGG.dates.forEach(function (dt) {
      if (+dt.slice(0, 4) !== y) return;
      var m = +dt.slice(5, 7) - 1;
      if (out.indexOf(m) === -1) out.push(m);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  function bindCalendarFilter() {
    var ySel = document.getElementById('cal-year');
    if (ySel) ySel.addEventListener('change', function () {
      calState.y = +ySel.value;
      var months = availableMonths(calState.y);
      if (months.indexOf(calState.m) === -1) {
        calState.m = months.length ? months[months.length - 1] : calState.m;
      }
      renderCalendar();
    });

    var prev = document.getElementById('cal-prev');
    var next = document.getElementById('cal-next');
    if (prev) prev.addEventListener('click', function () {
      calState.m--;
      if (calState.m < 0) { calState.m = 11; calState.y--; }
      renderCalendar();
    });
    if (next) next.addEventListener('click', function () {
      calState.m++;
      if (calState.m > 11) { calState.m = 0; calState.y++; }
      renderCalendar();
    });
  }

  /* ---------------- Module 3: 万收趋势 ---------------- */
  var trendState = { range: 30, metric: 'per' };
  var trendChart = null;

  function bindMetricSelect() {
    var sel = document.getElementById('metric-select');
    if (!sel) return;
    sel.value = trendState.metric;
    sel.addEventListener('change', function () {
      trendState.metric = sel.value;
      renderTrend();
    });
  }

  function bindRangeTabs() {
    var box = document.getElementById('range-tabs');
    if (!box) return;
    box.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        trendState.range = +btn.getAttribute('data-range');
        box.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b === btn); });
        renderTrend();
      });
    });
  }

  function trendPoints(p, range) {
    var n = p.dates.length;
    var latest = parseDate(p.dates[n - 1]);
    var cutoff = latest.getTime() - range * DAY;
    var start = 0;
    for (var i = 0; i < n; i++) {
      if (parseDate(p.dates[i]).getTime() <= cutoff) start = i;
      else break;
    }
    return start;
  }

  function renderTrend() {
    var el = document.getElementById('chart-trend');
    if (!trendChart) trendChart = echarts.init(el, null, { renderer: 'svg' });
    if (!AGG) {
      trendChart.clear();
      var emptySub = document.getElementById('trend-sub');
      if (emptySub) emptySub.textContent = '未选择产品，暂无趋势数据';
      return;
    }
    var multi = isMulti();
    var isAnn = trendState.metric === 'ann';
    var p = AGG;
    var start = trendPoints(p, trendState.range);
    var dates = p.dates.slice(start);
    var series = (isAnn ? (multi ? p.ann : p.dailyAnn) : p.per10k).slice(start);
    var counts = multi ? p.counts.slice(start) : null;
    var nav = multi ? null : p.nav.slice(start);
    var firstDate = dates[0];
    var lastDate = dates[dates.length - 1];
    var lastIdx = p.dates.length - 1;
    var latestPer = p.per10k[lastIdx];
    var latestAnn = multi ? (p.ann ? p.ann[lastIdx] : null) : (p.dailyAnn ? p.dailyAnn[lastIdx] : null);
    var lastVal = series[series.length - 1];
    var spanDays = dayDiff(parseDate(firstDate), parseDate(lastDate));
    var nonNull = series.filter(function (v) { return v !== null && v !== undefined; });
    var sum = 0;
    for (var i = 0; i < nonNull.length; i++) sum += nonNull[i];
    var avg = nonNull.length ? sum / nonNull.length : 0;
    var minV = nonNull.length ? Math.min(0, Math.min.apply(null, nonNull)) : 0;
    var maxV = nonNull.length ? Math.max(0, Math.max.apply(null, nonNull)) : 0;
    var maxIdx = -1, minIdx = -1;
    for (var k = 0; k < series.length; k++) {
      if (series[k] === null || series[k] === undefined) continue;
      if (maxIdx === -1 || series[k] > series[maxIdx]) maxIdx = k;
      if (minIdx === -1 || series[k] < series[minIdx]) minIdx = k;
    }
    var yMin = Math.floor(minV * 1.15 * 10) / 10;
    var yMax = Math.ceil(maxV * 1.15 * 10) / 10;

    var sub = document.getElementById('trend-sub');
    if (sub) {
      var extra = '';
      if (trendState.range > spanDays + 1) {
        if (multi) extra = ' · 所选产品最早万收日 ' + p.inception + '，已展示全部可用数据';
        else extra = ' · 该产品成立 ' + getModel(p.id).m.days + ' 天，已展示成立以来全部数据';
      }
      var prefix = isAnn
        ? (multi ? p.short + '平均年化 · ' : '')
        : (multi ? p.short + '合计 · ' : '');
      var statText = isAnn
        ? '区间日均年化 <strong class="' + colorBy(avg) + '">' + (avg >= 0 ? '+' : '') + avg.toFixed(2) + '%</strong>'
        : '区间日均万收 <strong class="' + colorBy(avg) + '">' + (avg >= 0 ? '+' : '') + avg.toFixed(2) + ' 元</strong>';
      sub.innerHTML = prefix + firstDate + ' 至 ' + lastDate + ' · 共 ' + dates.length + ' 个净值日 · ' + statText + extra;
    }

    var style = getComputedStyle(document.documentElement);
    var accentDeep = style.getPropertyValue('--accent-deep').trim();
    var lineColor = '#5b94a6';
    var ink = style.getPropertyValue('--ink').trim();
    var muted = style.getPropertyValue('--muted').trim();
    var rule = style.getPropertyValue('--rule').trim();
    var bg2 = style.getPropertyValue('--bg2').trim();

    trendChart.setOption({
      animation: false,
      grid: { left: 14, right: 38, top: 40, bottom: 12, containLabel: true },
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        backgroundColor: bg2,
        borderColor: rule,
        textStyle: { color: ink, fontSize: 12 },
        formatter: function (params) {
          var idx = params[0].dataIndex;
          var v = series[idx];
          var unit = v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + (isAnn ? '%' : ' 元');
          var label = isAnn
            ? (multi ? '平均年化' : '当日年化')
            : (multi ? '合计万份收益' : '万份收益');
          var lines = ['<strong>' + dates[idx] + '</strong>', label + '：' + unit];
          if (multi) lines.push('参与产品：' + counts[idx] + ' 款');
          else lines.push('单位净值：' + nav[idx].toFixed(6));
          return lines.join('<br/>');
        }
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: rule } },
        axisTick: { show: false },
        axisLabel: {
          color: muted, fontSize: 11,
          formatter: function (v) { return v.slice(5); }
        }
      },
      yAxis: {
        type: 'value',
        name: isAnn ? '%' : '',
        nameTextStyle: { color: muted, fontSize: 11 },
        min: yMin,
        max: yMax,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 11 },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      series: [{
        name: isAnn ? (multi ? '平均年化' : '日年化') : (multi ? '合计日万份收益' : '日万份收益'),
        type: 'line',
        data: series,
        smooth: 0.45,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false,
        lineStyle: { width: 2, color: lineColor },
        itemStyle: { color: lineColor },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: rule, type: 'solid', width: 1 },
          label: { show: false },
          data: [
            { yAxis: 0 },
            [
              { coord: [dates[maxIdx], series[maxIdx]] },
              { coord: [dates[maxIdx], yMin] }
            ],
            [
              { coord: [dates[minIdx], series[minIdx]] },
              { coord: [dates[minIdx], yMin] }
            ],
            [
              { coord: [dates[dates.length - 1], lastVal] },
              { coord: [dates[dates.length - 1], yMin] }
            ]
          ].map(function (d) {
            if (d instanceof Array) {
              d[0].lineStyle = { type: 'dashed', width: 1, color: 'rgba(91, 148, 166, 0.45)' };
              d[1].lineStyle = { type: 'dashed', width: 1, color: 'rgba(91, 148, 166, 0.3)' };
            }
            return d;
          })
        },
        markPoint: {
          symbol: 'circle',
          symbolSize: 1,
          itemStyle: { color: 'transparent' },
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 'bold',
            color: '#c0392b'
          },
          data: [
            {
              type: 'max', name: '最高',
              label: {
                offset: [0, -14],
                formatter: function (p) {
                  var n = Number(p.value);
                  return isAnn ? n.toFixed(2) + '%' : n.toFixed(2);
                }
              }
            },
            {
              type: 'min', name: '最低',
              label: {
                offset: [0, 16],
                formatter: function (p) {
                  var n = Number(p.value);
                  return isAnn ? n.toFixed(2) + '%' : n.toFixed(2);
                }
              }
            },
            {
              coord: [lastDate, lastVal],
              name: '最新',
              symbol: 'circle',
              symbolSize: 6,
              itemStyle: { color: lineColor },
              label: {
                show: true,
                position: 'top',
                offset: [0, -10],
                color: accentDeep,
                fontSize: 11.5,
                fontWeight: 600,
                lineHeight: 15,
                formatter: function () {
                  return isAnn ? fmtAnn(latestAnn) : fmt2(latestPer);
                }
              }
            }
          ]
        }
      }]
    }, true);
    trendChart.resize();
  }

  /* ---------------- 数据来源卡片 ---------------- */
  function renderSources() {
    var grid = document.getElementById('source-grid');
    if (!grid) return;
    grid.innerHTML = DATA.products.filter(function (p) {
      return selectedIds.indexOf(p.id) !== -1;
    }).map(function (p) {
      var latest = p.dates[p.dates.length - 1];
      return '<div class="source-card">' +
        '<h3>' + p.name + '</h3>' +
        '<p>' + (p.org || '') + ' · 登记编码 ' + p.regCode +
        (p.shareCode ? ' · 份额代码 ' + p.shareCode : '') + '</p>' +
        '<div class="meta-line">净值区间 ' + p.dates[0] + ' ~ ' + latest + ' · ' + p.dates.length + ' 条</div>' +
        '</div>';
    }).join('');
  }

  /* ---------------- 顶部产品多选 ---------------- */
  function shortOf(id) {
    for (var i = 0; i < DATA.products.length; i++) {
      if (DATA.products[i].id === id) return DATA.products[i].short;
    }
    return '';
  }

  function updatePickerLabel() {
    var el = document.getElementById('ms-label');
    if (!el) return;
    var n = selectedIds.length;
    el.textContent = n === 0
      ? '未选择产品'
      : n === DATA.products.length
        ? '全部产品（' + n + ' 款）'
        : (n === 1 ? shortOf(selectedIds[0]) : '已选 ' + n + ' 款');
  }

  var pickerQuery = '';

  function pickerMatches(p) {
    var q = pickerQuery.trim().toLowerCase();
    if (!q) return true;
    return (p.name || '').toLowerCase().indexOf(q) !== -1;
  }

  function renderPickerList() {
    var list = document.getElementById('ms-list');
    if (!list) return;
    var items = DATA.products.filter(pickerMatches);
    if (!items.length) {
      list.innerHTML = '<div class="ms-empty">未找到匹配产品</div>';
      return;
    }
    list.innerHTML = items.map(function (p) {
      var checked = selectedIds.indexOf(p.id) !== -1 ? ' checked' : '';
      return '<label class="ms-item">' +
        '<input type="checkbox" value="' + p.id + '"' + checked + '>' +
        '<span class="ms-name">' + p.short + '</span>' +
        '<em>' + p.regCode + '</em>' +
        '</label>';
    }).join('');
  }

  function openPanel() {
    var trigger = document.getElementById('ms-trigger');
    var panel = document.getElementById('ms-panel');
    if (!trigger || !panel) return;
    panel.hidden = false;
    var search = document.getElementById('ms-search');
    if (search) search.focus();
    var r = trigger.getBoundingClientRect();
    var pw = panel.offsetWidth;
    var ph = panel.offsetHeight;
    var left = Math.max(16, Math.min(r.left, window.innerWidth - pw - 16));
    var top = r.bottom + 8;
    if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 8);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    var panel = document.getElementById('ms-panel');
    var trigger = document.getElementById('ms-trigger');
    if (panel) panel.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function applySelection() {
    refreshAggregate();
    updatePickerLabel();
    renderProfitTable();
    resetCalendarMonth();
    renderCalendar();
    renderTrend();
    renderSources();
  }

  function initPicker() {
    var trigger = document.getElementById('ms-trigger');
    var panel = document.getElementById('ms-panel');
    var list = document.getElementById('ms-list');
    if (!trigger || !panel || !list) return;
    renderPickerList();
    updatePickerLabel();

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.hidden) openPanel(); else closePanel();
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { closePanel(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });

    list.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.type !== 'checkbox') return;
      var idx = selectedIds.indexOf(t.value);
      if (t.checked && idx === -1) {
        selectedIds.push(t.value);
      } else if (!t.checked && idx !== -1) {
        if (selectedIds.length === 1) { t.checked = true; return; }
        selectedIds.splice(idx, 1);
      }
      applySelection();
    });

    var search = document.getElementById('ms-search');
    if (search) search.addEventListener('input', function () {
      pickerQuery = search.value;
      renderPickerList();
    });

    var allBtn = panel.querySelector('[data-act="all"]');
    if (allBtn) allBtn.addEventListener('click', function () {
      selectedIds = DATA.products.map(function (p) { return p.id; });
      renderPickerList();
      applySelection();
    });

    var invertBtn = panel.querySelector('[data-act="invert"]');
    if (invertBtn) invertBtn.addEventListener('click', function () {
      selectedIds = DATA.products
        .map(function (p) { return p.id; })
        .filter(function (id) { return selectedIds.indexOf(id) === -1; });
      renderPickerList();
      applySelection();
    });
  }

  /* ---------------- 手动更新数据 ---------------- */
  // 用新数据重算派生指标并重渲染（事件只绑定一次，不重复挂载）
  function rebuildAll(data) {
    if (!data || !Array.isArray(data.products) || !data.products.length) {
      throw new Error('数据为空');
    }
    DATA = data;
    window.REPORT_DATA = data;

    MODEL = data.products.map(function (p) { return { product: p, m: calc(p) }; });
    data.products.forEach(function (p) {
      p.dailyAnn = p.nav.map(function (v, i) {
        if (i === 0) return null;
        return (v / p.nav[i - 1] - 1) * 365 * 100;
      });
    });
    window.DASHBOARD_METRICS = MODEL;

    var ids = data.products.map(function (p) { return p.id; });
    selectedIds = selectedIds.filter(function (id) { return ids.indexOf(id) !== -1; });
    if (!selectedIds.length) selectedIds = ids.slice();

    var asof = data.products.reduce(function (mx, p) {
      var d = p.dates[p.dates.length - 1];
      return d > mx ? d : mx;
    }, '');
    var asofEl = document.getElementById('hero-asof');
    if (asofEl) asofEl.textContent = asof;

    refreshAggregate();
    updatePickerLabel();
    renderPickerList();
    renderProfitTable();
    resetCalendarMonth();
    renderCalendar();
    renderTrend();
    renderSources();
  }

  function bindRefresh() {
    var btn = document.getElementById('refresh-data');
    if (!btn) return;
    var labelEl = btn.querySelector('.update-label');
    var defaultLabel = labelEl ? labelEl.textContent : '数据更新';
    var timer = null;
    var prevAsOf = DATA.asOf;

    function settle(cls, text) {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.classList.add(cls);
      if (labelEl) labelEl.textContent = text;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        btn.classList.remove(cls);
        if (labelEl) labelEl.textContent = defaultLabel;
        timer = null;
      }, 2000);
    }

    // 用 script 标签重新加载数据文件，兼容 file:// 与静态托管；query 用于避开缓存
    function loadScript(urls, i) {
      if (i >= urls.length) { settle('error', '更新失败'); return; }
      var script = document.createElement('script');
      script.src = urls[i];
      script.onload = function () {
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          rebuildAll(window.REPORT_DATA);
          settle('done', DATA.asOf === prevAsOf ? '已是最新' : '已更新');
        } catch (err) {
          if (window.console && console.error) console.error('[数据更新失败]', err);
          settle('error', '更新失败');
        }
      };
      script.onerror = function () {
        if (script.parentNode) script.parentNode.removeChild(script);
        loadScript(urls, i + 1);
      };
      document.head.appendChild(script);
    }

    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      prevAsOf = DATA.asOf;
      btn.disabled = true;
      btn.classList.remove('done', 'error');
      btn.classList.add('loading');
      if (labelEl) labelEl.textContent = '更新中…';
      var urls = location.protocol === 'file:'
        ? ['assets/data.js']
        : ['assets/data.js?t=' + Date.now()];
      loadScript(urls, 0);
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    var asof = DATA.products.reduce(function (mx, p) {
      var d = p.dates[p.dates.length - 1];
      return d > mx ? d : mx;
    }, '');
    var asofEl = document.getElementById('hero-asof');
    if (asofEl) asofEl.textContent = asof;

    initPicker();
    bindProfitSort();
    bindDataFilter();
    bindRefresh();
    renderProfitTable();
    resetCalendarMonth();
    renderCalendar();
    bindCalendarFilter();
    bindMetricSelect();
    bindRangeTabs();
    renderTrend();
    renderSources();
    window.addEventListener('resize', function () {
      if (trendChart) trendChart.resize();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
