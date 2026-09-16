(function () {
  "use strict";

  var SALES_KEY = "browns_sales_v1";
  var SETTINGS_KEY = "browns_settings_v1";

  var state = {
    sales: [],
    settings: { defaultCommissionRate: 10 },
    range: "all",
    search: "",
    sort: { field: "date", dir: "desc" },
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
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign({ defaultCommissionRate: 10 }, JSON.parse(raw)) : { defaultCommissionRate: 10 };
    } catch (e) {
      return { defaultCommissionRate: 10 };
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

  function inRange(dateStr, range) {
    if (range === "all") return true;
    var d = new Date(dateStr + "T00:00:00");
    var now = new Date();
    if (range === "today") {
      return d.toDateString() === now.toDateString();
    }
    if (range === "week") {
      var start = new Date(now);
      var day = start.getDay();
      var diff = (day === 0 ? 6 : day - 1); // Monday start
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      return d >= start;
    }
    if (range === "month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (range === "year") {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  }

  function filteredSales() {
    var term = state.search.trim().toLowerCase();
    return state.sales.filter(function (s) {
      if (!inRange(s.date, state.range)) return false;
      if (term && (s.item || "").toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
  }

  function sortedSales(list) {
    var field = state.sort.field;
    var dir = state.sort.dir === "asc" ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var av = a[field], bv = b[field];
      if (field === "amount" || field === "commission" || field === "commissionRate" || field === "qty") {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  // ---------- rendering ----------

  function renderSummary() {
    var list = filteredSales();
    var totalRevenue = list.reduce(function (sum, s) { return sum + Number(s.amount); }, 0);
    var totalCommission = list.reduce(function (sum, s) { return sum + Number(s.commission); }, 0);
    var count = list.length;
    var avg = count ? totalRevenue / count : 0;

    document.getElementById("sumRevenue").textContent = money(totalRevenue);
    document.getElementById("sumCommission").textContent = money(totalCommission);
    document.getElementById("sumCount").textContent = String(count);
    document.getElementById("sumAvg").textContent = money(avg);
  }

  function renderChart() {
    var chartEl = document.getElementById("chart");
    chartEl.innerHTML = "";

    var byMonth = {};
    state.sales.forEach(function (s) {
      var key = s.date.slice(0, 7); // YYYY-MM
      byMonth[key] = (byMonth[key] || 0) + Number(s.commission);
    });

    var keys = Object.keys(byMonth).sort().slice(-6); // last 6 months with data
    if (keys.length === 0) {
      chartEl.innerHTML = '<p class="chart-empty">No data yet.</p>';
      return;
    }

    var max = Math.max.apply(null, keys.map(function (k) { return byMonth[k]; }));
    max = max || 1;

    keys.forEach(function (k) {
      var value = byMonth[k];
      var pct = Math.max((value / max) * 100, 2);
      var wrap = document.createElement("div");
      wrap.className = "chart-bar-wrap";

      var bar = document.createElement("div");
      bar.className = "chart-bar";
      bar.style.height = pct + "%";
      bar.title = k + ": " + money(value);

      var label = document.createElement("div");
      label.className = "chart-bar-label";
      var parts = k.split("-");
      var monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      label.textContent = monthNames[parseInt(parts[1], 10) - 1] + " " + parts[0].slice(2);

      wrap.appendChild(bar);
      wrap.appendChild(label);
      chartEl.appendChild(wrap);
    });
  }

  function renderTable() {
    var tbody = document.getElementById("salesTableBody");
    var fullList = sortedSales(filteredSales());
    var visibleList = state.showAll ? fullList : fullList.slice(0, state.pageSize);
    tbody.innerHTML = "";

    document.getElementById("emptyState").classList.toggle("hidden", fullList.length !== 0);

    var footer = document.getElementById("tableFooter");
    if (fullList.length > state.pageSize) {
      footer.classList.remove("hidden");
      document.getElementById("tableFooterCount").textContent =
        "Showing " + visibleList.length + " of " + fullList.length + " sales";
      document.getElementById("showAllBtn").textContent = state.showAll ? "Show latest " + state.pageSize : "Show all";
    } else {
      footer.classList.add("hidden");
    }

    visibleList.forEach(function (s) {
      var tr = document.createElement("tr");

      tr.appendChild(td(formatDate(s.date), "Date"));
      tr.appendChild(td(s.item || "—", "Item"));
      tr.appendChild(td(String(Number(s.qty) || 1), "Qty"));
      tr.appendChild(td(money(s.amount), "Amount"));
      tr.appendChild(td((Number(s.commissionRate) || 0).toFixed(1) + "%", "Rate"));
      tr.appendChild(td(money(s.commission), "Commission"));

      var actionsTd = document.createElement("td");
      var actions = document.createElement("div");
      actions.className = "row-actions";

      var editBtn = document.createElement("button");
      editBtn.className = "btn-link-text";
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () { startEdit(s.id); });

      var delBtn = document.createElement("button");
      delBtn.className = "btn-danger-text";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () { deleteSale(s.id); });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      actionsTd.appendChild(actions);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    });
  }

  function td(text, label) {
    var el = document.createElement("td");
    el.textContent = text;
    el.setAttribute("data-label", label);
    return el;
  }

  function formatDate(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function renderItemSuggestions() {
    var datalist = document.getElementById("itemSuggestions");
    datalist.innerHTML = "";
    var seen = {};
    state.sales.forEach(function (s) {
      if (s.item && !seen[s.item]) {
        seen[s.item] = true;
        var opt = document.createElement("option");
        opt.value = s.item;
        datalist.appendChild(opt);
      }
    });
  }

  function renderAll() {
    renderSummary();
    renderChart();
    renderTable();
    renderItemSuggestions();
  }

  // ---------- CRUD ----------

  function addOrUpdateSale(data) {
    if (state.editingId) {
      var idx = state.sales.findIndex(function (s) { return s.id === state.editingId; });
      if (idx !== -1) {
        state.sales[idx] = Object.assign({}, state.sales[idx], data);
      }
      state.editingId = null;
    } else {
      state.sales.push(Object.assign({ id: uid() }, data));
    }
    saveSales();
    renderAll();
  }

  function deleteSale(id) {
    if (!confirm("Delete this sale?")) return;
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
    document.getElementById("saleItem").value = sale.item || "";
    document.getElementById("saleQty").value = Number(sale.qty) || 1;
    document.getElementById("saleAmount").value = sale.amount;
    document.getElementById("saleCommissionRate").value = sale.commissionRate;
    document.getElementById("saleCommissionAmount").value = sale.commission;

    document.getElementById("formTitle").textContent = "Edit Sale";
    document.getElementById("submitBtn").textContent = "Save Changes";
    document.getElementById("cancelEditBtn").classList.remove("hidden");
    document.getElementById("saleForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm(opts) {
    opts = opts || {};
    state.editingId = null;
    document.getElementById("formTitle").textContent = "Add Sale";
    document.getElementById("submitBtn").textContent = "Add Sale";
    document.getElementById("cancelEditBtn").classList.add("hidden");
    document.getElementById("saleId").value = "";

    if (opts.keepItem) {
      // Fast repeat-entry: leave item/qty/rate as-is, clear the amount and refocus it
      // so logging several sales of the same item is just "type price, hit Enter".
      document.getElementById("saleDate").value = todayISO();
      document.getElementById("saleAmount").value = "";
      document.getElementById("saleCommissionAmount").value = "";
      document.getElementById("saleAmount").focus();
    } else {
      document.getElementById("saleForm").reset();
      document.getElementById("saleDate").value = todayISO();
      document.getElementById("saleQty").value = 1;
      document.getElementById("saleCommissionRate").value = state.settings.defaultCommissionRate;
    }
  }

  // ---------- CSV export ----------

  function exportCSV() {
    var rows = [["Date", "Item", "Qty", "Amount", "Commission Rate (%)", "Commission ($)"]];
    sortedSales(state.sales).forEach(function (s) {
      rows.push([s.date, s.item || "", Number(s.qty) || 1, s.amount, s.commissionRate, s.commission]);
    });
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

  function computeCommissionFromRate() {
    var amount = parseFloat(document.getElementById("saleAmount").value) || 0;
    var rate = parseFloat(document.getElementById("saleCommissionRate").value) || 0;
    document.getElementById("saleCommissionAmount").value = (amount * rate / 100).toFixed(2);
  }

  function init() {
    state.sales = loadSales();
    state.settings = loadSettings();

    document.getElementById("saleDate").value = todayISO();
    document.getElementById("saleCommissionRate").value = state.settings.defaultCommissionRate;
    document.getElementById("defaultCommissionRate").value = state.settings.defaultCommissionRate;

    document.getElementById("saleAmount").addEventListener("input", computeCommissionFromRate);
    document.getElementById("saleCommissionRate").addEventListener("input", computeCommissionFromRate);

    document.getElementById("saleForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var amount = parseFloat(document.getElementById("saleAmount").value);
      if (isNaN(amount) || amount < 0) return;

      var wasEdit = !!state.editingId;
      var data = {
        date: document.getElementById("saleDate").value || todayISO(),
        item: document.getElementById("saleItem").value.trim(),
        qty: parseInt(document.getElementById("saleQty").value, 10) || 1,
        amount: amount,
        commissionRate: parseFloat(document.getElementById("saleCommissionRate").value) || 0,
        commission: parseFloat(document.getElementById("saleCommissionAmount").value) || 0
      };
      addOrUpdateSale(data);
      resetForm(wasEdit ? {} : { keepItem: true });
    });

    document.getElementById("cancelEditBtn").addEventListener("click", function () { resetForm(); });

    document.querySelectorAll(".filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".filter-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.range = btn.getAttribute("data-range");
        state.showAll = false;
        renderAll();
      });
    });

    document.querySelectorAll("#salesTable th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var field = th.getAttribute("data-sort");
        if (state.sort.field === field) {
          state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        } else {
          state.sort.field = field;
          state.sort.dir = "asc";
        }
        renderTable();
      });
    });

    document.getElementById("exportBtn").addEventListener("click", exportCSV);

    document.getElementById("searchInput").addEventListener("input", function (e) {
      state.search = e.target.value;
      state.showAll = false;
      renderTable();
      renderSummary();
    });

    document.getElementById("showAllBtn").addEventListener("click", function () {
      state.showAll = !state.showAll;
      renderTable();
    });

    document.getElementById("settingsBtn").addEventListener("click", function () {
      document.getElementById("settingsPanel").classList.toggle("hidden");
    });
    document.getElementById("closeSettingsBtn").addEventListener("click", function () {
      document.getElementById("settingsPanel").classList.add("hidden");
    });
    document.getElementById("saveSettingsBtn").addEventListener("click", function () {
      var rate = parseFloat(document.getElementById("defaultCommissionRate").value);
      state.settings.defaultCommissionRate = isNaN(rate) ? 10 : rate;
      saveSettings();
      document.getElementById("saleCommissionRate").value = state.settings.defaultCommissionRate;
      computeCommissionFromRate();
      document.getElementById("settingsPanel").classList.add("hidden");
    });

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
