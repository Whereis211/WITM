(function () {
  "use strict";

  var SALES_KEY = "browns_sales_v1";
  var SETTINGS_KEY = "browns_settings_v1";

  var state = {
    sales: [], // {id, date, amount} — one running total per day
    settings: { weeklyQuota: 9350, commissionRate: 4 },
    period: "daily", // daily | weekly | monthly | yearly
    editingId: null,
    pageSize: 50,
    showAll: false
  };

  // ---------- persistence ----------

  function loadSales() {
    try {
      var raw = localStorage.getItem(SALES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("Could not read sales from storage", e);
      return [];
    }
  }

  function saveSales() {
    try {
      localStorage.setItem(SALES_KEY, JSON.stringify(state.sales));
    } catch (e) {
      console.warn("Could not save sales to storage", e);
    }
  }

  function loadSettings() {
    var defaults = { weeklyQuota: 9350, commissionRate: 4 };
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign({}, defaults, JSON.parse(raw)) : defaults;
    } catch (e) {
      return defaults;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) {
      console.warn("Could not save settings to storage", e);
    }
  }

  // ---------- helpers ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function money(n) {
    return "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function todayISO() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function mondayOf(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    var day = d.getDay();
    var diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  }

  function addDays(dateStr, days) {
    var d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function formatDate(iso, opts) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, opts || { year: "numeric", month: "short", day: "numeric" });
  }

  var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTH_NAMES_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function formatMonthLabel(monthKey) {
    var parts = monthKey.split("-");
    return MONTH_NAMES_FULL[parseInt(parts[1], 10) - 1] + " " + parts[0];
  }

  function formatWeekLabel(weekStart) {
    var weekEnd = addDays(weekStart, 6);
    return formatDate(weekStart, { month: "short", day: "numeric" }) + " – " + formatDate(weekEnd, { month: "short", day: "numeric", year: "numeric" });
  }

  function groupSum(entries, keyFn) {
    var map = {};
    entries.forEach(function (e) {
      var k = keyFn(e);
      map[k] = (map[k] || 0) + Number(e.amount);
    });
    return map;
  }

  // ---------- aggregation ----------

  function buildWeeklyRows() {
    var revenueByWeek = groupSum(state.sales, function (e) { return mondayOf(e.date); });
    return Object.keys(revenueByWeek).map(function (weekStart) {
      var revenue = revenueByWeek[weekStart];
      var overQuota = Math.max(0, revenue - state.settings.weeklyQuota);
      var commission = overQuota * (state.settings.commissionRate / 100);
      return { weekStart: weekStart, revenue: revenue, overQuota: overQuota, commission: commission };
    });
  }

  function buildMonthlyRows(weeklyRows) {
    var revenueByMonth = groupSum(state.sales, function (e) { return e.date.slice(0, 7); });
    var commissionByMonth = {};
    weeklyRows.forEach(function (w) {
      var k = w.weekStart.slice(0, 7);
      commissionByMonth[k] = (commissionByMonth[k] || 0) + w.commission;
    });
    var keys = {};
    Object.keys(revenueByMonth).forEach(function (k) { keys[k] = true; });
    Object.keys(commissionByMonth).forEach(function (k) { keys[k] = true; });
    return Object.keys(keys).map(function (month) {
      return { month: month, revenue: revenueByMonth[month] || 0, commission: commissionByMonth[month] || 0 };
    });
  }

  function buildYearlyRows(weeklyRows) {
    var revenueByYear = groupSum(state.sales, function (e) { return e.date.slice(0, 4); });
    var commissionByYear = {};
    weeklyRows.forEach(function (w) {
      var k = w.weekStart.slice(0, 4);
      commissionByYear[k] = (commissionByYear[k] || 0) + w.commission;
    });
    var keys = {};
    Object.keys(revenueByYear).forEach(function (k) { keys[k] = true; });
    Object.keys(commissionByYear).forEach(function (k) { keys[k] = true; });
    return Object.keys(keys).map(function (year) {
      return { year: year, revenue: revenueByYear[year] || 0, commission: commissionByYear[year] || 0 };
    });
  }

  function buildDailyRows() {
    return state.sales.map(function (s) {
      return { id: s.id, date: s.date, revenue: Number(s.amount) || 0 };
    });
  }

  // ---------- rendering ----------

  function renderSummary() {
    var today = todayISO();
    var weeklyRows = buildWeeklyRows();
    var monthlyRows = buildMonthlyRows(weeklyRows);
    var yearlyRows = buildYearlyRows(weeklyRows);

    var todayRevenue = state.sales
      .filter(function (s) { return s.date === today; })
      .reduce(function (sum, s) { return sum + Number(s.amount); }, 0);

    var weekStart = mondayOf(today);
    var weekRow = weeklyRows.find(function (w) { return w.weekStart === weekStart; }) || { revenue: 0, commission: 0 };

    var monthKey = today.slice(0, 7);
    var monthRow = monthlyRows.find(function (m) { return m.month === monthKey; }) || { revenue: 0, commission: 0 };

    var yearKey = today.slice(0, 4);
    var yearRow = yearlyRows.find(function (y) { return y.year === yearKey; }) || { revenue: 0, commission: 0 };

    document.getElementById("sumTodayRevenue").textContent = money(todayRevenue);

    document.getElementById("sumWeekRevenue").textContent = money(weekRow.revenue);
    document.getElementById("sumWeekQuotaNote").textContent = "of " + money(state.settings.weeklyQuota) + " quota";
    document.getElementById("sumWeekCommission").textContent = "Commission: " + money(weekRow.commission);
    var pct = state.settings.weeklyQuota > 0 ? Math.min(100, (weekRow.revenue / state.settings.weeklyQuota) * 100) : 0;
    document.getElementById("sumWeekProgress").style.width = pct + "%";

    document.getElementById("sumMonthRevenue").textContent = money(monthRow.revenue);
    document.getElementById("sumMonthCommission").textContent = "Commission: " + money(monthRow.commission);

    document.getElementById("sumYearRevenue").textContent = money(yearRow.revenue);
    document.getElementById("sumYearCommission").textContent = "Commission: " + money(yearRow.commission);
  }

  function getPeriodRows() {
    var weeklyRows = buildWeeklyRows();
    if (state.period === "daily") return buildDailyRows().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (state.period === "weekly") return weeklyRows.slice().sort(function (a, b) { return a.weekStart < b.weekStart ? 1 : -1; });
    if (state.period === "monthly") return buildMonthlyRows(weeklyRows).sort(function (a, b) { return a.month < b.month ? 1 : -1; });
    return buildYearlyRows(weeklyRows).sort(function (a, b) { return a.year < b.year ? 1 : -1; });
  }

  function renderChart() {
    var chartEl = document.getElementById("chart");
    chartEl.innerHTML = "";

    var rows = getPeriodRows().slice().reverse(); // chronological ascending
    var points = rows.slice(-8);

    if (points.length === 0) {
      chartEl.innerHTML = '<p class="chart-empty">No data yet.</p>';
      return;
    }

    var max = Math.max.apply(null, points.map(function (r) { return r.revenue; }));
    max = max || 1;

    points.forEach(function (r) {
      var pct = Math.max((r.revenue / max) * 100, 2);
      var wrap = document.createElement("div");
      wrap.className = "chart-bar-wrap";

      var bar = document.createElement("div");
      bar.className = "chart-bar";
      bar.style.height = pct + "%";

      var label = document.createElement("div");
      label.className = "chart-bar-label";

      if (state.period === "daily") {
        bar.title = formatDate(r.date) + ": " + money(r.revenue);
        label.textContent = formatDate(r.date, { month: "short", day: "numeric" });
      } else if (state.period === "weekly") {
        bar.title = formatWeekLabel(r.weekStart) + ": " + money(r.revenue);
        label.textContent = formatDate(r.weekStart, { month: "short", day: "numeric" });
      } else if (state.period === "monthly") {
        bar.title = formatMonthLabel(r.month) + ": " + money(r.revenue);
        var mParts = r.month.split("-");
        label.textContent = MONTH_NAMES[parseInt(mParts[1], 10) - 1] + " " + mParts[0].slice(2);
      } else {
        bar.title = r.year + ": " + money(r.revenue);
        label.textContent = r.year;
      }

      wrap.appendChild(bar);
      wrap.appendChild(label);
      chartEl.appendChild(wrap);
    });
  }

  function td(text, label) {
    var el = document.createElement("td");
    el.textContent = text;
    if (label) el.setAttribute("data-label", label);
    return el;
  }

  function renderBreakdown() {
    var titles = { daily: "Daily Sales", weekly: "Weekly Sales", monthly: "Monthly Sales", yearly: "Yearly Sales" };
    document.getElementById("chartTitle").textContent = titles[state.period];
    document.getElementById("breakdownTitle").textContent =
      state.period.charAt(0).toUpperCase() + state.period.slice(1) + " Breakdown";

    var head = document.getElementById("breakdownHead");
    var body = document.getElementById("breakdownBody");
    head.innerHTML = "";
    body.innerHTML = "";

    var headRow = document.createElement("tr");
    var columns;
    if (state.period === "daily") {
      columns = ["Date", "Sales Total", ""];
    } else if (state.period === "weekly") {
      columns = ["Week", "Sales Total", "Quota", "Over Quota", "Commission"];
    } else {
      columns = [state.period === "monthly" ? "Month" : "Year", "Sales Total", "Commission"];
    }
    columns.forEach(function (c) {
      var th = document.createElement("th");
      th.textContent = c;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);

    var fullList = getPeriodRows();
    var visibleList = state.showAll ? fullList : fullList.slice(0, state.pageSize);

    document.getElementById("emptyState").classList.toggle("hidden", fullList.length !== 0);

    var footer = document.getElementById("tableFooter");
    if (fullList.length > state.pageSize) {
      footer.classList.remove("hidden");
      document.getElementById("tableFooterCount").textContent =
        "Showing " + visibleList.length + " of " + fullList.length;
      document.getElementById("showAllBtn").textContent = state.showAll ? "Show latest " + state.pageSize : "Show all";
    } else {
      footer.classList.add("hidden");
    }

    visibleList.forEach(function (row) {
      var tr = document.createElement("tr");

      if (state.period === "daily") {
        tr.appendChild(td(formatDate(row.date), "Date"));
        tr.appendChild(td(money(row.revenue), "Sales Total"));

        var actionsTd = document.createElement("td");
        var actions = document.createElement("div");
        actions.className = "row-actions";

        var editBtn = document.createElement("button");
        editBtn.className = "btn-link-text";
        editBtn.type = "button";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () { startEdit(row.id); });

        var delBtn = document.createElement("button");
        delBtn.className = "btn-danger-text";
        delBtn.type = "button";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", function () { deleteSale(row.id); });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        actionsTd.appendChild(actions);
        tr.appendChild(actionsTd);
      } else if (state.period === "weekly") {
        tr.appendChild(td(formatWeekLabel(row.weekStart), "Week"));
        tr.appendChild(td(money(row.revenue), "Sales Total"));
        tr.appendChild(td(money(state.settings.weeklyQuota), "Quota"));
        tr.appendChild(td(money(row.overQuota), "Over Quota"));
        tr.appendChild(td(money(row.commission), "Commission"));
      } else if (state.period === "monthly") {
        tr.appendChild(td(formatMonthLabel(row.month), "Month"));
        tr.appendChild(td(money(row.revenue), "Sales Total"));
        tr.appendChild(td(money(row.commission), "Commission"));
      } else {
        tr.appendChild(td(row.year, "Year"));
        tr.appendChild(td(money(row.revenue), "Sales Total"));
        tr.appendChild(td(money(row.commission), "Commission"));
      }

      body.appendChild(tr);
    });
  }

  function renderAll() {
    renderSummary();
    renderChart();
    renderBreakdown();
  }

  // ---------- CRUD ----------

  function addOrUpdateSale(data) {
    var id = state.editingId;
    // One entry per date: drop any other entry on this date, keeping the one being edited (if any).
    state.sales = state.sales.filter(function (s) {
      if (id && s.id === id) return true;
      return s.date !== data.date;
    });
    if (id) {
      var idx = state.sales.findIndex(function (s) { return s.id === id; });
      if (idx !== -1) {
        state.sales[idx] = Object.assign({}, state.sales[idx], data);
      } else {
        state.sales.push(Object.assign({ id: id }, data));
      }
    } else {
      state.sales.push(Object.assign({ id: uid() }, data));
    }
    state.editingId = null;
    saveSales();
    renderAll();
  }

  function deleteSale(id) {
    if (!confirm("Delete this day's total?")) return;
    state.sales = state.sales.filter(function (s) { return s.id !== id; });
    saveSales();
    renderAll();
  }

  function startEdit(id) {
    var sale = state.sales.find(function (s) { return s.id === id; });
    if (!sale) return;
    state.editingId = id;

    document.getElementById("saleId").value = sale.id;
    document.getElementById("saleDate").value = sale.date;
    document.getElementById("saleAmount").value = sale.amount;

    document.getElementById("formTitle").textContent = "Edit Daily Total";
    document.getElementById("submitBtn").textContent = "Save Changes";
    document.getElementById("cancelEditBtn").classList.remove("hidden");
    document.getElementById("saleForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    state.editingId = null;
    document.getElementById("saleId").value = "";
    document.getElementById("saleDate").value = todayISO();
    document.getElementById("saleAmount").value = "";
    document.getElementById("formTitle").textContent = "Add Daily Total";
    document.getElementById("submitBtn").textContent = "Save";
    document.getElementById("cancelEditBtn").classList.add("hidden");
    document.getElementById("saleAmount").focus();
  }

  // ---------- CSV export ----------

  function exportCSV() {
    var rows = [["Date", "Sales Total"]];
    state.sales
      .slice()
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .forEach(function (s) { rows.push([s.date, s.amount]); });

    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var str = String(cell);
        if (str.indexOf(",") !== -1 || str.indexOf('"') !== -1) {
          str = '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(",");
    }).join("\n");

    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "browns-sales-" + todayISO() + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- wiring ----------

  function init() {
    state.sales = loadSales();
    state.settings = loadSettings();

    document.getElementById("saleDate").value = todayISO();
    document.getElementById("weeklyQuota").value = state.settings.weeklyQuota;
    document.getElementById("commissionRate").value = state.settings.commissionRate;

    document.getElementById("saleForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var amount = parseFloat(document.getElementById("saleAmount").value);
      if (isNaN(amount) || amount < 0) return;

      var data = {
        date: document.getElementById("saleDate").value || todayISO(),
        amount: amount
      };
      addOrUpdateSale(data);
      resetForm();
    });

    document.getElementById("cancelEditBtn").addEventListener("click", function () { resetForm(); });

    document.querySelectorAll("#periodTabs .filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#periodTabs .filter-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.period = btn.getAttribute("data-period");
        state.showAll = false;
        renderChart();
        renderBreakdown();
      });
    });

    document.getElementById("showAllBtn").addEventListener("click", function () {
      state.showAll = !state.showAll;
      renderBreakdown();
    });

    document.getElementById("exportBtn").addEventListener("click", exportCSV);

    document.getElementById("settingsBtn").addEventListener("click", function () {
      document.getElementById("settingsPanel").classList.toggle("hidden");
    });
    document.getElementById("closeSettingsBtn").addEventListener("click", function () {
      document.getElementById("settingsPanel").classList.add("hidden");
    });
    document.getElementById("saveSettingsBtn").addEventListener("click", function () {
      var quota = parseFloat(document.getElementById("weeklyQuota").value);
      var rate = parseFloat(document.getElementById("commissionRate").value);
      state.settings.weeklyQuota = isNaN(quota) ? 9350 : quota;
      state.settings.commissionRate = isNaN(rate) ? 4 : rate;
      saveSettings();
      document.getElementById("settingsPanel").classList.add("hidden");
      renderAll();
    });

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
