(() => {
  'use strict';

  const STORAGE_KEY = 'sarmoya.finance.v1';
  const DEFAULT_BUDGET = 5000000;
  const CATEGORIES = {
    income: ['Salary', 'Freelance', 'Investment', 'Other'],
    expense: ['Food & Dining', 'Utilities & Bills', 'Transport', 'Entertainment', 'Shopping', 'Health', 'Rent']
  };
  const CATEGORY_ICONS = {
    Salary: '↗', Freelance: '⌘', Investment: '◈', Other: '•',
    'Food & Dining': '⌑', 'Utilities & Bills': '⌁', Transport: '↗', Entertainment: '♫', Shopping: '◇', Health: '+', Rent: '⌂'
  };
  const CHART_COLORS = ['#818cf8', '#10b981', '#f43f5e', '#fbbf24', '#38bdf8', '#a78bfa', '#fb7185'];

  const formatMoney = (value) => `${Math.round(Number(value) || 0).toLocaleString('uz-UZ').replace(/\u00a0/g, ' ')} so'm`;
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
      const month = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(now);
      document.querySelector('#current-period').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
      document.querySelector('#budget-month').textContent = month;
      document.querySelector('#footer-year').textContent = now.getFullYear();
    }

    applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      document.querySelector('#theme-toggle').setAttribute('aria-label', `Switch to ${nextTheme} theme`);
      document.querySelector('#theme-label').textContent = `${nextTheme === 'light' ? 'Light' : 'Dark'} appearance`;
      document.querySelector('#mobile-theme-toggle').setAttribute('aria-label', `Switch to ${nextTheme} theme`);
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
      status.textContent = percent >= 100 ? 'Budget exceeded' : warning ? 'Approaching your limit' : 'Budget available';
      status.classList.toggle('is-warning', warning);
      fill.style.width = `${cappedPercent}%`;
      fill.classList.toggle('is-warning', warning);
      const track = document.querySelector('#budget-progress-track');
      track.setAttribute('aria-valuenow', String(Math.min(Math.round(percent), 100)));
      track.setAttribute('aria-valuetext', `${Math.round(percent)} percent of monthly budget used`);
    }

    renderRecurring() {
      const bills = this.store.recurringExpenses();
      const total = bills.reduce((sum, transaction) => sum + transaction.amount, 0);
      document.querySelector('#recurring-total').textContent = formatMoney(total);
      document.querySelector('#recurring-count').textContent = `${bills.length} ${bills.length === 1 ? 'bill' : 'bills'}`;
      const list = document.querySelector('#recurring-list-content');
      if (!bills.length) {
        list.innerHTML = '<div class="recurring-empty">Recurring expenses you mark will appear here.</div>';
        return;
      }
      list.innerHTML = bills.map((bill) => {
        const title = bill.notes.trim() || bill.category;
        return `<article class="recurring-item"><span class="recurring-item-icon" aria-hidden="true">${escapeHTML(CATEGORY_ICONS[bill.category] || '↻')}</span><span class="recurring-item-copy"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(bill.category)} · monthly</span></span><span class="recurring-item-amount">${formatMoney(bill.amount)}</span></article>`;
      }).join('');
    }

    visibleTransactions() {
      const search = this.filters.search.trim().toLowerCase();
      const list = this.store.data.transactions.filter((transaction) => {
        const matchesSearch = !search || `${transaction.category} ${transaction.notes}`.toLowerCase().includes(search);
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
      document.querySelector('#transaction-count').textContent = `${this.store.data.transactions.length} ${this.store.data.transactions.length === 1 ? 'record' : 'records'}`;
      list.innerHTML = transactions.map((transaction) => {
        const isIncome = transaction.type === 'income';
        const title = transaction.notes.trim() || transaction.category;
        const date = new Date(`${transaction.date}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
        const recurring = transaction.recurring ? '<span class="recurring-tag" title="Repeats monthly">↻ Monthly</span>' : '';
        return `<tr><td><div class="transaction-name"><span class="transaction-type-icon ${transaction.type}" aria-hidden="true">${isIncome ? '↗' : escapeHTML(CATEGORY_ICONS[transaction.category] || '•')}</span><span class="transaction-name-copy"><strong>${escapeHTML(title)}</strong><span>${isIncome ? 'Income' : 'Expense'}${recurring}</span></span></div></td><td><span class="category-pill">${escapeHTML(transaction.category)}</span></td><td>${escapeHTML(date)}</td><td class="amount-cell ${isIncome ? 'amount-positive' : ''}">${isIncome ? '+' : '−'}${formatMoney(transaction.amount)}</td><td><span class="row-actions"><button type="button" data-action="edit" data-id="${escapeHTML(transaction.id)}" aria-label="Edit ${escapeHTML(title)}" title="Edit">✎</button><button class="delete-action" type="button" data-action="delete" data-id="${escapeHTML(transaction.id)}" aria-label="Delete ${escapeHTML(title)}" title="Delete">×</button></span></td></tr>`;
      }).join('');
      empty.classList.toggle('is-visible', transactions.length === 0);
      document.querySelector('.transaction-table').hidden = transactions.length === 0;
      document.querySelector('#empty-title').textContent = noTransactions ? 'A clearer picture starts here' : 'No matching transactions';
      document.querySelector('#empty-message').textContent = noTransactions ? 'Add your first transaction to see your financial activity.' : 'Try adjusting your search or filters.';
      document.querySelector('#empty-add-button').hidden = !noTransactions;
    }

    renderCategoryOptions() {
      const filter = document.querySelector('#category-filter');
      const previous = filter.value;
      const categories = [...new Set(this.store.data.transactions.map((transaction) => transaction.category))].sort((a, b) => a.localeCompare(b));
      filter.innerHTML = '<option value="all">All categories</option>' + categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
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
          data: { labels: ['Income', 'Expenses'], datasets: [{ data: values, backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 0, hoverOffset: 5 }] },
          options: { responsive: true, maintainAspectRatio: true, cutout: '78%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ${context.label}: ${formatMoney(context.raw)}` } } } }
        });
      }
      document.querySelector('#cashflow-legend').innerHTML = [
        { label: 'Income', amount: totals.income, color: '#10b981' },
        { label: 'Expenses', amount: totals.expense, color: '#f43f5e' }
      ].map((item) => `<div class="legend-item"><span class="legend-dot" style="background:${item.color}"></span><span class="legend-copy"><span>${item.label}</span><strong>${formatMoney(item.amount)}</strong></span></div>`).join('');

      const categories = this.store.data.transactions.filter((item) => item.type === 'expense').reduce((sums, item) => {
        sums[item.category] = (sums[item.category] || 0) + item.amount;
        return sums;
      }, {});
      const labels = Object.keys(categories).sort((a, b) => categories[b] - categories[a]);
      const categoryCanvas = document.querySelector('#category-chart');
      document.querySelector('#category-chart-empty').classList.toggle('is-visible', labels.length === 0);
      categoryCanvas.style.visibility = labels.length ? 'visible' : 'hidden';
      const chartData = { labels, datasets: [{ data: labels.map((label) => categories[label]), backgroundColor: labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]), borderRadius: 5, maxBarThickness: 27 }] };
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
      document.querySelector('#transaction-dialog-title').textContent = transaction ? 'Edit transaction' : 'Add transaction';
      document.querySelector('#save-transaction-button').textContent = transaction ? 'Save changes' : 'Save transaction';
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
      select.innerHTML = CATEGORIES[type].map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
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
      const rows = [['ID', 'Amount (UZS)', 'Type', 'Category', 'Date', 'Notes', 'Recurring']];
      const safeCell = (value) => {
        let text = String(value ?? '');
        if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      this.store.data.transactions.forEach((item) => rows.push([item.id, item.amount, item.type, item.category, item.date, item.notes, item.recurring ? 'Yes' : 'No']));
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
        this.ui.toast('Your transaction history has been exported.');
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
        this.ui.toast(saved ? 'All transactions have been cleared.' : 'Data was cleared for this session, but browser storage is unavailable.');
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
        error.textContent = 'Enter an amount greater than zero.';
        return;
      }
      if (!CATEGORIES[type].includes(category) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        error.textContent = 'Choose a valid category and date.';
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
      this.ui.toast(saved ? 'Transaction saved.' : 'Transaction saved for this session, but browser storage is unavailable.');
    }

    saveBudget(event) {
      event.preventDefault();
      const amount = Number(document.querySelector('#budget-input').value);
      const error = document.querySelector('#budget-error');
      if (!Number.isFinite(amount) || amount <= 0) {
        error.textContent = 'Enter a budget greater than zero.';
        return;
      }
      const saved = this.store.setBudget(amount);
      document.querySelector('#budget-dialog').close();
      this.ui.renderBudget();
      this.ui.toast(saved ? 'Monthly budget updated.' : 'Budget updated for this session, but browser storage is unavailable.');
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
        this.ui.toast('Transaction deleted.');
      }
    }

    setActiveNavigation() {
      const hash = window.location.hash || '#overview';
      document.querySelectorAll('.main-nav a').forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === hash));
    }
  }

  document.addEventListener('DOMContentLoaded', () => new App());
})();
