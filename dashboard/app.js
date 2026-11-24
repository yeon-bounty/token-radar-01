// Token Radar's dashboard (model radar-2). It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer
// with the model's own inputs and the protocol's farm plan, and the live-token view.
// No network: every byte it shows is in data.js.
//
// The page recomputes each row from the snapshot figures with the same arithmetic main.ts
// runs, and rebuilds each farm plan from the same derivation, so the page and the board
// are visibly the same model. The pure functions are exposed as window.Farm and
// window.RadarModel so they can be checked outside a browser.
(function () {
  'use strict';

  // ---------------------------------------------------------------- formatting
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : n.toFixed(2) + 'x'; }

  // ---------------------------------------------------------------- model (radar-2, same arithmetic as lib/model.ts)
  function growthMultiplier(change7d, model) {
    var g = (change7d === null || change7d === undefined || !isFinite(change7d)) ? 0 : change7d;
    var sign = g < 0 ? -1 : 1;
    var mag = Math.min(Math.abs(g), model.growth_hard_cap);
    return 1 + model.growth_weight * sign * (Math.log1p(mag) / Math.log1p(model.growth_log_cap));
  }
  function maturityMultiplier(age, model) {
    var days = (age === null || age === undefined) ? model.unknown_age_days : age;
    if (days <= model.maturity_peak_days) {
      return model.maturity_floor + (Math.max(days, 0) / model.maturity_peak_days) * model.maturity_range;
    }
    var past = days - model.maturity_peak_days;
    return model.maturity_floor + Math.max(0, 1 - past / model.maturity_tail_days) * model.maturity_range;
  }
  function breadthMultiplier(chains, model) {
    var extra = Math.min(Math.max((chains || []).length - 1, 0), model.breadth_max_chains);
    return 1 + extra * model.breadth_step;
  }
  function impliedOf(row, model) {
    var growthMult = growthMultiplier(row.change_7d, model);
    var maturityMult = maturityMultiplier(row.age_days, model);
    var breadthMult = breadthMultiplier(row.chains, model);
    return Math.max(1, Math.round(row.tvl_usd * row.base_multiple * growthMult * maturityMult * breadthMult));
  }
  var RadarModel = { growthMultiplier: growthMultiplier, maturityMultiplier: maturityMultiplier, breadthMultiplier: breadthMultiplier, impliedOf: impliedOf };
  window.RadarModel = RadarModel;

  // ---------------------------------------------------------------- farm plan (same derivation as lib/model.ts)
  function chainOf(p) { return (p.chains && p.chains.length > 0) ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 'about $12 of gas';
    if (c.indexOf('bitcoin') >= 0 || c.indexOf('solana') >= 0) return 'under $1 of gas';
    return 'about $2 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + "'s lending market on " + chain + ' and leave it earning.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + " of liquidity to " + name + "'s busiest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-yield vault on " + chain + ' and let it compound.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking pool') >= 0) return 'Stake $' + capital + " of the chain asset through " + name + ' on ' + chain + ' and hold the receipt token.';
    if (c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of staked assets through ' + name + ' on ' + chain + ' and keep the position active.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position in an open market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it through the next payout.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy open.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the account active.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + " of assets in " + name + "'s governance vault on " + chain + ' and vote on the next proposal.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Once a week, supply or borrow a small amount on ' + name + ' so the position stays active.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return "Once a week, make one swap in " + name + "'s main pool on " + chain + '.';
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0) return 'Once a week, add a little to the ' + name + ' vault or claim and restake its yield.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Once a week, bridge a small amount through ' + name + ' to keep the route warm.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Once a week, check the staking rewards on ' + name + ' and restake what has accrued.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Once a week, adjust or rebalance the small hedge on ' + name + '.';
    if (c.indexOf('prediction') >= 0) return 'Once a week, settle or open one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return "Once a week, check the " + name + " vault's allocation and add a little if it is still open.";
    if (c.indexOf('rwa') >= 0) return 'Once a week, check the yield payout on the ' + name + ' asset and keep holding it.';
    if (c.indexOf('governance') >= 0) return 'Once a week, check ' + name + ' for a new proposal and vote while the position is locked.';
    return 'Once a week, make one small qualifying action on ' + name + ', such as a deposit, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'nothing to set up', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: weeklyFor(p, chain), cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, never from a link in a message.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet address, the dates and every transaction in a farm log, so you can repeat the position or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  var Farm = { chainOf: chainOf, gasFor: gasFor, capitalFor: capitalFor, holdDaysFor: holdDaysFor, actionFor: actionFor, weeklyFor: weeklyFor, stepText: stepText, farmSteps: farmSteps };
  window.Farm = Farm;

  // ---------------------------------------------------------------- data and state
  var DATA = window.RADAR;
  if (!DATA || typeof document === 'undefined') return;

  var state = { q: '', category: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var WATCHLIST = {};
  (DATA.rows || []).forEach(function (r) { if (r.watchlist) WATCHLIST[r.slug] = true; });

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---------------------------------------------------------------- hash deep-links: #/detail/<slug>, #/live, #/cat/<category>, #/q/<text>
  function readHash() {
    var hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) return;
    var parts = hash.split('/');
    if (parts[0] === 'detail' && parts[1]) state.selected = decodeURIComponent(parts[1]);
    else if (parts[0] === 'live') state.tab = 'live';
    else if (parts[0] === 'cat' && parts[1]) state.category = decodeURIComponent(parts[1]);
    else if (parts[0] === 'q' && parts[1]) state.q = decodeURIComponent(parts[1]);
  }
  function writeHash() {
    var next = '';
    if (state.selected) next = '#/detail/' + encodeURIComponent(state.selected);
    else if (state.tab === 'live') next = '#/live';
    else if (state.category !== 'all') next = '#/cat/' + encodeURIComponent(state.category);
    else if (state.q) next = '#/q/' + encodeURIComponent(state.q);
    if (next) window.history.replaceState(null, '', next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---------------------------------------------------------------- filtering and sorting
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.watchlistOnly && !WATCHLIST[r.slug]) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---------------------------------------------------------------- sections
  function renderMasthead() {
    var meta = document.getElementById('masthead-meta');
    meta.textContent = '';
    meta.appendChild(el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })));
    meta.appendChild(el('span', null, 'Source ', el('b', { text: DATA.source })));
    meta.appendChild(el('span', null, 'Model ', el('b', { text: DATA.model_version })));
    meta.appendChild(el('span', null, el('b', { text: String(DATA.board_size) }), ' rows'));
  }

  function renderHero() {
    var hero = document.getElementById('hero');
    hero.textContent = '';
    hero.appendChild(el('h1', { text: 'The next token launches, ranked before they happen' }));
    hero.appendChild(el('p', { text: 'Every protocol on the watchlist has at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, scored by the same model. Implied value is an estimate from the snapshot, not a price.' }));
    var top = DATA.rows.slice(0, 3);
    var grid = el('div', { class: 'spotlight' });
    top.forEach(function (r, i) {
      var labels = ['Top pick', 'Runner-up', 'Third'];
      grid.appendChild(el('button', { type: 'button', class: 'spot', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: labels[i] + ' · Rank ' + r.rank }),
        el('h2', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' · TVL ' + fmtUsd(r.tvl_usd) + ' · ' + fmtPct(r.change_7d) + ' in 7d' }),
        el('div', { class: 'val' }, fmtUsd(r.implied_value_usd), el('small', { text: ' implied value' }))
      ));
    });
    hero.appendChild(grid);
  }

  function renderToolbar() {
    var search = document.getElementById('search');
    search.value = state.q;
    search.oninput = function () { state.q = search.value; writeHash(); renderBoard(); };
    var select = document.getElementById('category');
    if (select.options.length === 0) {
      var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
      select.appendChild(el('option', { value: 'all', text: 'All categories' }));
      categories.forEach(function (c) { select.appendChild(el('option', { value: c, text: c })); });
    }
    select.value = state.category;
    select.onchange = function () { state.category = select.value; writeHash(); renderBoard(); };
    var wl = document.getElementById('watchlist-only');
    wl.checked = state.watchlistOnly;
    wl.onchange = function () { state.watchlistOnly = wl.checked; renderBoard(); };
    var sort = document.getElementById('sort');
    sort.value = state.sort;
    sort.onchange = function () { state.sort = sort.value; state.dir = -1; renderBoard(); };
    var pre = document.getElementById('tab-pre');
    var live = document.getElementById('tab-live');
    pre.setAttribute('aria-selected', state.tab === 'pre-token' ? 'true' : 'false');
    live.setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    pre.onclick = function () { state.tab = 'pre-token'; writeHash(); renderBoard(); };
    live.onclick = function () { state.tab = 'live'; writeHash(); renderBoard(); };
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } renderBoard(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function renderBoard() {
    var board = document.getElementById('board');
    var liveEl = document.getElementById('live');
    var count = document.getElementById('rowcount');
    renderToolbar();
    if (state.tab === 'live') {
      board.hidden = true;
      liveEl.hidden = false;
      count.textContent = DATA.live.length + ' live-token protocols';
      liveEl.textContent = '';
      var tbody = el('tbody');
      DATA.live.forEach(function (r) {
        tbody.appendChild(el('tr', null,
          el('td', null, el('span', { class: 'pill live', text: 'already trades' })),
          el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })
        ));
      });
      liveEl.appendChild(el('table', null,
        el('caption', { text: 'These protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Token' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }))),
        tbody
      ));
      return;
    }
    board.hidden = false;
    liveEl.hidden = true;
    var list = sortedRows(filteredRows());
    count.textContent = list.length + ' of ' + DATA.board_size + ' rows';
    board.textContent = '';
    if (list.length === 0) {
      board.appendChild(el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.watchlistOnly = false; writeHash(); renderBoard(); } })
      ));
      return;
    }
    var max = list[0].implied_value_usd || 1;
    var tb = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tb.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          r.watchlist ? el('span', { class: 'wl', text: 'watchlist' }) : null,
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'bar-wrap' },
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'pill', text: 'no token' }))
      ));
    });
    board.appendChild(el('table', null,
      el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
      el('thead', null, el('tr', null,
        sortHeader('implied', 'Rank'),
        sortHeader('name', 'Protocol'),
        sortHeader('tvl', 'TVL'),
        sortHeader('growth', '7d'),
        sortHeader('age', 'Age'),
        sortHeader('implied', 'Implied value'),
        el('th', { scope: 'col', text: 'Token' })
      )),
      tb
    ));
  }

  function renderModelCard() {
    var m = DATA.model;
    var card = document.getElementById('model-card');
    card.textContent = '';
    card.appendChild(el('h2', { text: 'How implied value is computed' }));
    card.appendChild(el('p', { text: 'One function scores every row, from the snapshot figures only. No protocol name is special-cased.' }));
    card.appendChild(el('div', { class: 'formula' },
      el('b', { text: 'implied = round( TVL × category multiple × growth × maturity × breadth )' })
    ));
    card.appendChild(el('p', { text: 'Category multiple: the median market-cap / TVL of live-token protocols in the same category, measured from this snapshot (global median where a category has fewer than ' + m.min_comparables + ' comparables), clamped to ' + m.multiple_floor + '–' + m.multiple_cap + '.' }));
    card.appendChild(el('p', { text: 'Growth: the 7-day change on a saturating log scale, so one explosive week cannot dominate — a +4448% week scores barely above a +120% one.' }));
    card.appendChild(el('p', { text: 'Maturity: a launch-window curve over the protocol’s age — 0.70 for a new listing, 1.00 at two years, falling back toward 0.70 for protocols that have run for years with no token. Breadth: +0.03 per chain beyond the first, up to 8 extra chains.' }));
  }

  function renderMultiplesCard() {
    var card = document.getElementById('multiples-card');
    card.textContent = '';
    card.appendChild(el('h2', { text: 'Category multiples, measured from the snapshot' }));
    card.appendChild(el('p', { text: 'Median market-cap / TVL of each category’s live-token protocols. Thin categories use the global median, ' + fmtMult(DATA.multiples.global) + '.' }));
    var rows = DATA.multiples.by_category.slice().sort(function (a, b) { return b.multiple - a.multiple; });
    var tbody = el('tbody');
    rows.forEach(function (m) {
      tbody.appendChild(el('tr', null,
        el('td', { text: m.category }),
        el('td', { class: 'num', text: String(m.comparables) }),
        el('td', { class: 'num', text: fmtMult(m.multiple) })
      ));
    });
    card.appendChild(el('table', { class: 'mult-table' },
      el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live' }), el('th', { scope: 'col', text: 'Multiple' }))),
      tbody
    ));
  }

  function renderChartCard() {
    var card = document.getElementById('chart-card');
    card.textContent = '';
    card.appendChild(el('h2', { text: 'Implied value by category' }));
    var totals = {};
    DATA.rows.forEach(function (r) {
      var key = r.category || 'Other';
      totals[key] = (totals[key] || 0) + r.implied_value_usd;
    });
    var top = Object.keys(totals).map(function (k) { return { category: k, total: totals[k] }; })
      .sort(function (a, b) { return b.total - a.total; }).slice(0, 6);
    if (top.length === 0) return;
    var max = top[0].total;
    top.forEach(function (t) {
      card.appendChild(el('div', { class: 'chart-row' },
        el('span', { class: 'lbl', text: t.category }),
        el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((t.total / max) * 100)) + '%' })),
        el('span', { class: 'val', text: fmtUsd(t.total) })
      ));
    });
    card.appendChild(el('p', { text: 'Total implied value of the board’s rows, by category.' }));
  }

  // ---------------------------------------------------------------- detail drawer
  var drawer = document.getElementById('drawer');
  var scrim = document.getElementById('scrim');
  function closeDetail() {
    state.selected = null;
    drawer.hidden = true;
    scrim.hidden = true;
    writeHash();
    renderBoard();
  }
  scrim.addEventListener('click', closeDetail);
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var recomputed = impliedOf(row, DATA.model);
    drawer.textContent = '';
    drawer.appendChild(el('button', { class: 'close', type: 'button', text: 'Close', onclick: closeDetail }));
    drawer.appendChild(el('h2', { text: row.name }));
    drawer.appendChild(el('p', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') }));
    var kv = el('div', { class: 'kv' });
    kv.appendChild(el('span', { text: 'TVL' })); kv.appendChild(el('b', { text: fmtUsd(row.tvl_usd) }));
    kv.appendChild(el('span', { text: 'Seven-day growth' })); kv.appendChild(el('b', { text: fmtPct(row.change_7d) }));
    kv.appendChild(el('span', { text: 'Age with no token' })); kv.appendChild(el('b', { text: fmtAge(row.age_days) }));
    kv.appendChild(el('span', { text: 'Category multiple' })); kv.appendChild(el('b', { text: fmtMult(row.base_multiple) }));
    kv.appendChild(el('span', { text: 'Growth multiplier' })); kv.appendChild(el('b', { text: fmtMult(row.growth_multiplier) }));
    kv.appendChild(el('span', { text: 'Maturity multiplier' })); kv.appendChild(el('b', { text: fmtMult(row.maturity_multiplier) }));
    kv.appendChild(el('span', { text: 'Breadth multiplier' })); kv.appendChild(el('b', { text: fmtMult(row.breadth_multiplier) }));
    kv.appendChild(el('span', { text: 'Implied value' })); kv.appendChild(el('b', { text: fmtUsd(row.implied_value_usd) }));
    drawer.appendChild(el('h3', { text: 'Model breakdown' }));
    drawer.appendChild(kv);
    drawer.appendChild(el('p', { class: 'note', text: 'The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ' — that differs from the board, so the data would be stale.') + ' This is an estimate, not a price.' }));
    drawer.appendChild(el('h3', { text: 'Farm plan' }));
    var ol = el('ol', { class: 'steps' });
    farmSteps(row).forEach(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      ol.appendChild(el('li', null, action, el('span', { class: 'cost', text: tail })));
    });
    drawer.appendChild(ol);
    drawer.hidden = false;
    scrim.hidden = false;
    renderBoard();
  }

  // ---------------------------------------------------------------- boot
  readHash();
  renderMasthead();
  renderHero();
  renderModelCard();
  renderMultiplesCard();
  renderChartCard();
  renderBoard();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !drawer.hidden) closeDetail();
  });
})();
