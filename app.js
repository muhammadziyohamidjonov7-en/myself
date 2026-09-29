(() => {
  'use strict';

  const STORAGE_KEY = 'sarmoya.finance.v1';
  const DEFAULT_BUDGET = 5000000;
  const CATEGORIES = {
    income: ['Salary', 'Freelance', 'Investment', 'Other'],
    expense: ['Food & Dining', 'Utilities & Bills', 'Transport', 'Entertainment', 'Shopping', 'Health', 'Rent']
  };
  const CATEGORY_LABELS = {
    Salary: 'Maosh', Freelance: 'Frilanserlik', Investment: 'Sarmoya', Other: 'Boshqa',
    'Food & Dining': 'Oziq-ovqat', 'Utilities & Bills': 'Kommunal to‘lovlar', Transport: 'Transport',
    Entertainment: 'Ko‘ngilochar', Shopping: 'Xaridlar', Health: 'Salomatlik', Rent: 'Ijara'
  };
  const CATEGORY_ICONS = {
    Salary: '↗', Freelance: '⌘', Investment: '◈', Other: '•',
    'Food & Dining': '⌑', 'Utilities & Bills': '⌁', Transport: '↗', Entertainment: '♫', Shopping: '◇', Health: '+', Rent: '⌂'
  };
  const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
  const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
  const CHART_COLORS = ['#818cf8', '#10b981', '#f43f5e', '#fbbf24', '#38bdf8', '#a78bfa', '#fb7185'];

  const formatMoney = (value) => `${String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so‘m`;
  const categoryLabel = (category) => CATEGORY_LABELS[category] || category;
  const formatDate = (date) => `${date.getDate()}-${UZ_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const localDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const validTransaction = (item) => item && typeof item.id === 'string' && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 && ['income', 'expense'].includes(item.type) && CATEGORIES[item.type].includes(item.category) && /^\d{4}-\d{2}-\d{2}$/.test(item.date);

  class Store {
    constructor() {
      this.data = this.load();
    }

    load() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return {
          transactions: Array.isArray(parsed?.transactions) ? parsed.transactions.filter(validTransaction).map((item) => ({
            id: item.id,
            amount: Number(item.amount),
            type: item.type,
            category: item.category,
            date: item.date,
            notes: String(item.notes ?? '').slice(0, 120),
            recurring: item.type === 'expense' && item.recurring === true
          })) : [],
          budgetLimit: Number.isFinite(Number(parsed?.budgetLimit)) && Number(parsed.budgetLimit) > 0 ? Number(parsed.budgetLimit) : DEFAULT_BUDGET,
          theme: parsed?.theme === 'light' ? 'light' : 'dark'
        };
      } catch {
        return { transactions: [], budgetLimit: DEFAULT_BUDGET, theme: 'dark' };
      }
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        return true;
      } catch {
        return false;
      }
    }

    upsert(transaction) {
      const index = this.data.transactions.findIndex((item) => item.id === transaction.id);
      if (index === -1) this.data.transactions.unshift(transaction);
      else this.data.transactions[index] = transaction;
      return this.save();
    }

    remove(id) {
      this.data.transactions = this.data.transactions.filter((item) => item.id !== id);
      return this.save();
    }

    setBudget(amount) {
      this.data.budgetLimit = amount;
      return this.save();
    }

    setTheme(theme) {
      this.data.theme = theme;
      return this.save();
    }

    clear() {
      this.data.transactions = [];
      this.data.budgetLimit = DEFAULT_BUDGET;
      return this.save();
    }

    totals(transactions = this.data.transactions) {
      return transactions.reduce((totals, transaction) => {
        totals[transaction.type] += transaction.amount;
        return totals;
      }, { income: 0, expense: 0 });
    }

    currentMonthExpenses() {
      const month = localDateString().slice(0, 7);
      return this.data.transactions
        .filter((transaction) => transaction.type === 'expense' && transaction.date.slice(0, 7) === month)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    }

    recurringExpenses() {
      return this.data.transactions.filter((transaction) => transaction.type === 'expense' && transaction.recurring);
    }
  }

  class UI {
    constructor(store) {
      this.store = store;
      this.cashflowChart = null;
      this.categoryChart = null;
      this.toastTimer = null;
      this.toastElement = document.querySelector('#toast');
      this.filters = { search: '', type: 'all', category: 'all', sort: 'date-desc' };
      this.applyTheme(store.data.theme);
      this.setPeriodLabels();
    }

    setPeriodLabels() {
      const now = new Date();
      const month = `${UZ_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
      document.querySelector('#current-period').textContent = `${UZ_WEEKDAYS[now.getDay()]}, ${formatDate(now)}`;
      document.querySelector('#budget-month').textContent = month;
      document.querySelector('#footer-year').textContent = now.getFullYear();
    }

    applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      const nextThemeLabel = nextTheme === 'light' ? 'yorug‘' : 'qorong‘i';
      document.querySelector('#theme-toggle').setAttribute('aria-label', `${nextThemeLabel} mavzuga o‘tish`);
      document.querySelector('#theme-label').textContent = `${nextTheme === 'light' ? 'Yorug‘' : 'Qorong‘i'} ko‘rinish`;
      document.querySelector('#mobile-theme-toggle').setAttribute('aria-label', `${nextThemeLabel} mavzuga o‘tish`);
    }

    render() {
      this.renderSummary();
      this.renderBudget();
      this.renderRecurring();
      this.renderTransactions();
      this.renderCharts();
    }

    renderSummary() {
      const totals = this.store.totals();
      document.querySelector('#total-income').textContent = formatMoney(totals.income);
      document.querySelector('#total-expenses').textContent = formatMoney(totals.expense);
      const balance = totals.income - totals.expense;
      document.querySelector('#net-balance').textContent = formatMoney(balance);
      document.querySelector('#chart-net-balance').textContent = formatMoney(balance);
      document.querySelector('#net-balance').classList.toggle('amount-positive', balance >= 0);
    }

    renderBudget() {
      const spent = this.store.currentMonthExpenses();
      const limit = this.store.data.budgetLimit;
      const percent = limit > 0 ? (spent / limit) * 100 : 0;
      const cappedPercent = Math.min(percent, 100);
      const warning = percent >= 80;
      const fill = document.querySelector('#budget-progress-fill');
      const percentElement = document.querySelector('#budget-percent');
      const status = document.querySelector('#budget-status');
      document.querySelector('#budget-spent').textContent = formatMoney(spent);
      document.querySelector('#budget-limit').textContent = formatMoney(limit);
      percentElement.textContent = `${Math.round(percent)}%`;
      percentElement.classList.toggle('is-warning', warning);
      status.textContent = percent >= 100 ? 'Budjetdan oshib ketdi' : warning ? 'Limitga yaqinlashdi' : 'Budjet yetarli';
      status.classList.toggle('is-warning', warning);
      fill.style.width = `${cappedPercent}%`;
      fill.classList.toggle('is-warning', warning);
      const track = document.querySelector('#budget-progress-track');
      track.setAttribute('aria-valuenow', String(Math.min(Math.round(percent), 100)));
      track.setAttribute('aria-valuetext', `Oylik budjetning ${Math.round(percent)} foizi sarflandi`);
    }

    renderRecurring() {
      const bills = this.store.recurringExpenses();
      const total = bills.reduce((sum, transaction) => sum + transaction.amount, 0);
      document.querySelector('#recurring-total').textContent = formatMoney(total);
      document.querySelector('#recurring-count').textContent = `${bills.length} ta to‘lov`;
      const list = document.querySelector('#recurring-list-content');
      if (!bills.length) {
        list.innerHTML = '<div class="recurring-empty">Takroriy deb belgilangan xarajatlar shu yerda ko‘rinadi.</div>';
        return;
      }
      list.innerHTML = bills.map((bill) => {
        const title = bill.notes.trim() || categoryLabel(bill.category);
        return `<article class="recurring-item"><span class="recurring-item-icon" aria-hidden="true">${escapeHTML(CATEGORY_ICONS[bill.category] || '↻')}</span><span class="recurring-item-copy"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(categoryLabel(bill.category))} · har oy</span></span><span class="recurring-item-amount">${formatMoney(bill.amount)}</span></article>`;
      }).join('');
    }

    visibleTransactions() {
      const search = this.filters.search.trim().toLowerCase();
      const list = this.store.data.transactions.filter((transaction) => {
        const matchesSearch = !search || `${categoryLabel(transaction.category)} ${transaction.notes}`.toLowerCase().includes(search);
        return matchesSearch && (this.filters.type === 'all' || transaction.type === this.filters.type) && (this.filters.category === 'all' || transaction.category === this.filters.category);
      });
      const sorters = {
        'date-desc': (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
        'date-asc': (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
        'amount-desc': (a, b) => b.amount - a.amount || b.date.localeCompare(a.date),
        'amount-asc': (a, b) => a.amount - b.amount || b.date.localeCompare(a.date)
      };
      return list.sort(sorters[this.filters.sort]);
    }

    renderTransactions() {
      const transactions = this.visibleTransactions();
      const list = document.querySelector('#transaction-list');
      const empty = document.querySelector('#empty-state');
      const noTransactions = this.store.data.transactions.length === 0;
      document.querySelector('#transaction-count').textContent = `${this.store.data.transactions.length} ta yozuv`;
      list.innerHTML = transactions.map((transaction) => {
        const isIncome = transaction.type === 'income';
        const title = transaction.notes.trim() || categoryLabel(transaction.category);
        const date = formatDate(new Date(`${transaction.date}T12:00:00`));
        const recurring = transaction.recurring ? '<span class="recurring-tag" title="Har oy takrorlanadi">↻ Har oy</span>' : '';
        return `<tr><td><div class="transaction-name"><span class="transaction-type-icon ${transaction.type}" aria-hidden="true">${isIncome ? '↗' : escapeHTML(CATEGORY_ICONS[transaction.category] || '•')}</span><span class="transaction-name-copy"><strong>${escapeHTML(title)}</strong><span>${isIncome ? 'Daromad' : 'Xarajat'}${recurring}</span></span></div></td><td><span class="category-pill">${escapeHTML(categoryLabel(transaction.category))}</span></td><td>${escapeHTML(date)}</td><td class="amount-cell ${isIncome ? 'amount-positive' : ''}">${isIncome ? '+' : '−'}${formatMoney(transaction.amount)}</td><td><span class="row-actions"><button type="button" data-action="edit" data-id="${escapeHTML(transaction.id)}" aria-label="${escapeHTML(title)} operatsiyasini tahrirlash" title="Tahrirlash">✎</button><button class="delete-action" type="button" data-action="delete" data-id="${escapeHTML(transaction.id)}" aria-label="${escapeHTML(title)} operatsiyasini o‘chirish" title="O‘chirish">×</button></span></td></tr>`;
      }).join('');
      empty.classList.toggle('is-visible', transactions.length === 0);
      document.querySelector('.transaction-table').hidden = transactions.length === 0;
      document.querySelector('#empty-title').textContent = noTransactions ? 'Moliyaviy hisobni bugun boshlang' : 'Mos operatsiya topilmadi';
      document.querySelector('#empty-message').textContent = noTransactions ? 'Faoliyatingizni ko‘rish uchun ilk operatsiyani qo‘shing.' : 'Qidiruv so‘zi yoki filtrlarni o‘zgartirib ko‘ring.';
      document.querySelector('#empty-add-button').hidden = !noTransactions;
    }

    renderCategoryOptions() {
      const filter = document.querySelector('#category-filter');
      const previous = filter.value;
      const categories = [...new Set(this.store.data.transactions.map((transaction) => transaction.category))].sort((a, b) => a.localeCompare(b));
      filter.innerHTML = '<option value="all">Barcha kategoriyalar</option>' + categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(categoryLabel(category))}</option>`).join('');
      filter.value = categories.includes(previous) ? previous : 'all';
      this.filters.category = filter.value;
    }

    renderCharts() {
      if (typeof Chart === 'undefined') return;
      const totals = this.store.totals();
      const theme = document.documentElement.dataset.theme;
      const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim();
      const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
      const canvas = document.querySelector('#cashflow-chart');
      const values = [totals.income, totals.expense];
      if (this.cashflowChart) {
        this.cashflowChart.data.datasets[0].data = values;
        this.cashflowChart.options.plugins.legend.display = false;
        this.cashflowChart.update();
      } else {
        this.cashflowChart = new Chart(canvas, {
          type: 'doughnut',
          data: { labels: ['Daromad', 'Xarajat'], datasets: [{ data: values, backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 0, hoverOffset: 5 }] },
          options: { responsive: true, maintainAspectRatio: true, cutout: '78%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ${context.label}: ${formatMoney(context.raw)}` } } } }
        });
      }
      document.querySelector('#cashflow-legend').innerHTML = [
        { label: 'Daromad', amount: totals.income, color: '#10b981' },
        { label: 'Xarajat', amount: totals.expense, color: '#f43f5e' }
      ].map((item) => `<div class="legend-item"><span class="legend-dot" style="background:${item.color}"></span><span class="legend-copy"><span>${item.label}</span><strong>${formatMoney(item.amount)}</strong></span></div>`).join('');

      const categories = this.store.data.transactions.filter((item) => item.type === 'expense').reduce((sums, item) => {
        sums[item.category] = (sums[item.category] || 0) + item.amount;
        return sums;
      }, {});
      const categoryKeys = Object.keys(categories).sort((a, b) => categories[b] - categories[a]);
      const labels = categoryKeys.map(categoryLabel);
      const categoryCanvas = document.querySelector('#category-chart');
      document.querySelector('#category-chart-empty').classList.toggle('is-visible', labels.length === 0);
      categoryCanvas.style.visibility = labels.length ? 'visible' : 'hidden';
      const chartData = { labels, datasets: [{ data: categoryKeys.map((label) => categories[label]), backgroundColor: labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]), borderRadius: 5, maxBarThickness: 27 }] };
      const chartOptions = {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ${formatMoney(context.raw)}` } } },
        scales: {
          x: { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, ticks: { color: textColor, font: { family: 'DM Sans', size: 9 }, callback: (value) => Number(value).toLocaleString('uz-UZ') } },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: textColor, font: { family: 'DM Sans', size: 9 } } }
        }
      };
      if (this.categoryChart) {
        this.categoryChart.data = chartData;
        this.categoryChart.options = chartOptions;
        this.categoryChart.update();
      } else {
        this.categoryChart = new Chart(categoryCanvas, { type: 'bar', data: chartData, options: chartOptions });
      }
      if (this.cashflowChart) {
        this.cashflowChart.options.plugins.tooltip.titleColor = theme === 'dark' ? '#f1f5f9' : '#182237';
      }
    }

    openTransaction(transaction = null) {
      const form = document.querySelector('#transaction-form');
      form.reset();
      document.querySelector('#transaction-error').textContent = '';
      document.querySelector('#transaction-dialog-title').textContent = transaction ? 'Operatsiyani tahrirlash' : 'Operatsiya qo‘shish';
      document.querySelector('#save-transaction-button').textContent = transaction ? 'O‘zgarishlarni saqlash' : 'Saqlash';
      document.querySelector('#transaction-id').value = transaction?.id || '';
      document.querySelector(`input[name="type"][value="${transaction?.type || 'expense'}"]`).checked = true;
      this.updateCategoryOptions(transaction?.category);
      document.querySelector('#amount-input').value = transaction?.amount ?? '';
      document.querySelector('#date-input').value = transaction?.date || localDateString();
      document.querySelector('#notes-input').value = transaction?.notes || '';
      document.querySelector('#recurring-input').checked = Boolean(transaction?.recurring);
      this.updateRecurringVisibility();
      document.querySelector('#transaction-dialog').showModal();
      document.querySelector('#amount-input').focus();
    }

    updateCategoryOptions(selectedCategory = '') {
      const type = document.querySelector('input[name="type"]:checked').value;
      const select = document.querySelector('#category-input');
      select.innerHTML = CATEGORIES[type].map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(categoryLabel(category))}</option>`).join('');
      if (CATEGORIES[type].includes(selectedCategory)) select.value = selectedCategory;
    }

    updateRecurringVisibility() {
      const income = document.querySelector('input[name="type"]:checked').value === 'income';
      const row = document.querySelector('#recurring-check-row');
      row.hidden = income;
      if (income) document.querySelector('#recurring-input').checked = false;
    }

    toast(message) {
      window.clearTimeout(this.toastTimer);
      this.toastElement.textContent = message;
      this.toastElement.classList.add('is-visible');
      this.toastTimer = window.setTimeout(() => this.toastElement.classList.remove('is-visible'), 2800);
    }

    showConfirm() {
      document.querySelector('#confirm-dialog').showModal();
    }

    downloadCSV() {
      const rows = [['ID', 'Summa (UZS)', 'Turi', 'Kategoriya', 'Sana', 'Izoh', 'Takroriy']];
      const safeCell = (value) => {
        let text = String(value ?? '');
        if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      this.store.data.transactions.forEach((item) => rows.push([item.id, item.amount, item.type === 'income' ? 'Daromad' : 'Xarajat', categoryLabel(item.category), item.date, item.notes, item.recurring ? 'Ha' : 'Yo‘q']));
      const csv = '\ufeff' + rows.map((row) => row.map(safeCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `sarmoya-transactions-${localDateString()}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  }

  class App {
    constructor() {
      this.store = new Store();
      this.ui = new UI(this.store);
      this.bindEvents();
      this.ui.renderCategoryOptions();
      this.ui.render();
      this.setActiveNavigation();
    }

    bindEvents() {
      document.querySelector('#add-transaction-button').addEventListener('click', () => this.ui.openTransaction());
      document.querySelector('#empty-add-button').addEventListener('click', () => this.ui.openTransaction());
      document.querySelector('#edit-budget-button').addEventListener('click', () => {
        document.querySelector('#budget-input').value = this.store.data.budgetLimit;
        document.querySelector('#budget-error').textContent = '';
        document.querySelector('#budget-dialog').showModal();
      });
      document.querySelector('#theme-toggle').addEventListener('click', () => this.toggleTheme());
      document.querySelector('#mobile-theme-toggle').addEventListener('click', () => this.toggleTheme());
      document.querySelector('#export-button').addEventListener('click', () => {
        this.ui.downloadCSV();
        this.ui.toast('Operatsiyalar tarixi yuklab olindi.');
      });
      document.querySelector('#clear-data-button').addEventListener('click', () => this.ui.showConfirm());
      document.querySelector('#search-input').addEventListener('input', (event) => {
        this.ui.filters.search = event.target.value;
        this.ui.renderTransactions();
      });
      document.querySelector('#type-filter').addEventListener('change', (event) => {
        this.ui.filters.type = event.target.value;
        this.ui.renderCategoryOptions();
        this.ui.renderTransactions();
      });
      document.querySelector('#category-filter').addEventListener('change', (event) => {
        this.ui.filters.category = event.target.value;
        this.ui.renderTransactions();
      });
      document.querySelector('#sort-select').addEventListener('change', (event) => {
        this.ui.filters.sort = event.target.value;
        this.ui.renderTransactions();
      });
      document.querySelectorAll('input[name="type"]').forEach((radio) => radio.addEventListener('change', () => {
        this.ui.updateCategoryOptions();
        this.ui.updateRecurringVisibility();
      }));
      document.querySelector('#transaction-form').addEventListener('submit', (event) => this.saveTransaction(event));
      document.querySelector('#budget-form').addEventListener('submit', (event) => this.saveBudget(event));
      document.querySelector('#transaction-list').addEventListener('click', (event) => this.handleTransactionAction(event));
      document.querySelector('#confirm-clear-button').addEventListener('click', () => {
        const saved = this.store.clear();
        document.querySelector('#confirm-dialog').close();
        this.ui.renderCategoryOptions();
        this.ui.render();
        this.ui.toast(saved ? 'Barcha operatsiyalar o‘chirildi.' : 'Ma’lumotlar ushbu seans uchun o‘chirildi, ammo brauzer xotirasiga kirib bo‘lmadi.');
      });
      document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => {
        document.querySelector(`#${button.dataset.closeDialog}`).close();
      }));
      document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      }));
      document.querySelectorAll('.main-nav a').forEach((link) => link.addEventListener('click', () => {
        document.querySelectorAll('.main-nav a').forEach((item) => item.classList.toggle('is-active', item === link));
      }));
      window.addEventListener('hashchange', () => this.setActiveNavigation());
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
          this.store.data = this.store.load();
          this.ui.applyTheme(this.store.data.theme);
          this.ui.renderCategoryOptions();
          this.ui.render();
        }
      });
    }

    toggleTheme() {
      const theme = this.store.data.theme === 'dark' ? 'light' : 'dark';
      this.store.setTheme(theme);
      this.ui.applyTheme(theme);
      this.ui.renderCharts();
    }

    saveTransaction(event) {
      event.preventDefault();
      const amount = Number(document.querySelector('#amount-input').value);
      const type = document.querySelector('input[name="type"]:checked').value;
      const category = document.querySelector('#category-input').value;
      const date = document.querySelector('#date-input').value;
      const error = document.querySelector('#transaction-error');
      if (!Number.isFinite(amount) || amount <= 0) {
        error.textContent = 'Noldan katta summani kiriting.';
        return;
      }
      if (!CATEGORIES[type].includes(category) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        error.textContent = 'To‘g‘ri kategoriya va sanani tanlang.';
        return;
      }
      const id = document.querySelector('#transaction-id').value || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const transaction = {
        id, amount, type, category, date,
        notes: document.querySelector('#notes-input').value.trim().slice(0, 120),
        recurring: type === 'expense' && document.querySelector('#recurring-input').checked
      };
      const saved = this.store.upsert(transaction);
      document.querySelector('#transaction-dialog').close();
      this.ui.renderCategoryOptions();
      this.ui.render();
      this.ui.toast(saved ? 'Operatsiya saqlandi.' : 'Operatsiya ushbu seans uchun saqlandi, ammo brauzer xotirasiga kirib bo‘lmadi.');
    }

    saveBudget(event) {
      event.preventDefault();
      const amount = Number(document.querySelector('#budget-input').value);
      const error = document.querySelector('#budget-error');
      if (!Number.isFinite(amount) || amount <= 0) {
        error.textContent = 'Noldan katta budjet summasini kiriting.';
        return;
      }
      const saved = this.store.setBudget(amount);
      document.querySelector('#budget-dialog').close();
      this.ui.renderBudget();
      this.ui.toast(saved ? 'Oylik budjet yangilandi.' : 'Budjet ushbu seans uchun yangilandi, ammo brauzer xotirasiga kirib bo‘lmadi.');
    }

    handleTransactionAction(event) {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const transaction = this.store.data.transactions.find((item) => item.id === button.dataset.id);
      if (!transaction) return;
      if (button.dataset.action === 'edit') {
        this.ui.openTransaction(transaction);
        return;
      }
      if (button.dataset.action === 'delete') {
        this.store.remove(transaction.id);
        this.ui.renderCategoryOptions();
        this.ui.render();
        this.ui.toast('Operatsiya o‘chirildi.');
      }
    }

    setActiveNavigation() {
      const hash = window.location.hash || '#overview';
      document.querySelectorAll('.main-nav a').forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === hash));
    }
  }

  document.addEventListener('DOMContentLoaded', () => new App());
})();
