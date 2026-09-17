(function () {
  "use strict";

  var SALES_KEY = "browns_sales_v1";
  var SETTINGS_KEY = "browns_settings_v1";
  var PASSCODE_KEY = "browns_sync_passcode";

  var DEFAULT_SETTINGS = {
    weeklyQuota: 9350,      // threshold above which commission is earned
    commissionRate: 4,      // % commission on sales over the weekly quota
    weeklyGoal: 20000,      // dashboard/streak target, independent of the quota
    hourlyWage: 18.25,
    monthlyGoal: 86600,
    yearlyGoal: 1040000
  };

  var state = {
    sales: [], // {id, date, amount, hours} — one running total per day
    settings: Object.assign({}, DEFAULT_SETTINGS),
    period: "daily", // daily | weekly | monthly | yearly
    chartMode: "sales", // sales | commission
    editingId: null,
    pageSize: 50,
    showAll: false,
    coachResultsShown: false // whether a completed analysis is currently on screen
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
      return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) {
      console.warn("Could not save settings to storage", e);
    }
  }

  // ---------- cross-device sync ----------
  // Optional: set a passcode (Settings > Sync) to push/pull this data from
  // /api/data, backed by a key-value store on the server. With no passcode
  // set, the app behaves exactly as a local-only, offline app.

  function loadPasscode() {
    try {
      return localStorage.getItem(PASSCODE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function savePasscode(p) {
    try {
      localStorage.setItem(PASSCODE_KEY, p);
    } catch (e) {
      console.warn("Could not save sync passcode", e);
    }
  }

  function setSyncStatus(text) {
    var el = document.getElementById("syncStatus");
    if (el) el.textContent = text;
  }

  function pushToServer() {
    var passcode = loadPasscode();
    if (!passcode) return;
    fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcode, sales: state.sales, settings: state.settings })
    }).then(function (res) {
      setSyncStatus(res.ok ? "Synced" : "Sync error: check your passcode");
    }).catch(function () {
      setSyncStatus("Offline — will retry on next change");
    });
  }

  function pullFromServer() {
    var passcode = loadPasscode();
    if (!passcode) return Promise.resolve(false);
    return fetch("/api/data?passcode=" + encodeURIComponent(passcode))
      .then(function (res) {
        if (!res.ok) {
          setSyncStatus(res.status === 401 ? "Sync error: wrong passcode" : "Sync error");
          return false;
        }
        return res.json().then(function (data) {
          if (data && Array.isArray(data.sales) && data.settings) {
            state.sales = data.sales;
            state.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
            saveSales();
            saveSettings();
          }
          setSyncStatus("Synced");
          return true;
        });
      })
      .catch(function () {
        setSyncStatus("Offline — using this device's local data");
        return false;
      });
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

  // Monday = 1 ... Sunday = 7
  function isoDayOfWeek(dateStr) {
    var day = new Date(dateStr + "T00:00:00").getDay();
    return day === 0 ? 7 : day;
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

  function commissionForRevenue(revenue) {
    var overQuota = Math.max(0, revenue - state.settings.weeklyQuota);
    return overQuota * (state.settings.commissionRate / 100);
  }

  // ---------- aggregation ----------

  function buildWeeklyRows() {
    var revenueByWeek = groupSum(state.sales, function (e) { return mondayOf(e.date); });
    var hoursByWeek = {};
    state.sales.forEach(function (e) {
      var k = mondayOf(e.date);
      hoursByWeek[k] = (hoursByWeek[k] || 0) + (Number(e.hours) || 0);
    });
    return Object.keys(revenueByWeek).map(function (weekStart) {
      var revenue = revenueByWeek[weekStart];
      var overQuota = Math.max(0, revenue - state.settings.weeklyQuota);
      var commission = commissionForRevenue(revenue);
      var hours = hoursByWeek[weekStart] || 0;
      var baseWages = hours * state.settings.hourlyWage;
      return {
        weekStart: weekStart,
        revenue: revenue,
        overQuota: overQuota,
        commission: commission,
        hours: hours,
        baseWages: baseWages,
        grossEarnings: baseWages + commission,
        goalMet: revenue >= state.settings.weeklyGoal
      };
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
      var hours = Number(s.hours) || 0;
      var revenue = Number(s.amount) || 0;
      return {
        id: s.id,
        date: s.date,
        revenue: revenue,
        hours: hours,
        salesPerHour: hours > 0 ? revenue / hours : null
      };
    });
  }

  // Fills gaps between the earliest and latest logged week with $0 weeks,
  // so a streak breaks across weeks with no entries at all.
  function buildFilledWeeklyRows(weeklyRows) {
    if (weeklyRows.length === 0) return [];
    var byStart = {};
    weeklyRows.forEach(function (w) { byStart[w.weekStart] = w; });
    var starts = Object.keys(byStart).sort();
    var first = starts[0];
    var last = starts[starts.length - 1];
    var filled = [];
    var cursor = first;
    while (cursor <= last) {
      if (byStart[cursor]) {
        filled.push(byStart[cursor]);
      } else {
        filled.push({ weekStart: cursor, revenue: 0, goalMet: false });
      }
      cursor = addDays(cursor, 7);
    }
    return filled;
  }

  function computeStreaks(filledWeeklyRows) {
    var longest = 0;
    var run = 0;
    filledWeeklyRows.forEach(function (w) {
      if (w.goalMet) { run++; longest = Math.max(longest, run); } else { run = 0; }
    });
    var current = 0;
    for (var i = filledWeeklyRows.length - 1; i >= 0; i--) {
      if (filledWeeklyRows[i].goalMet) current++; else break;
    }
    return { current: current, longest: longest };
  }

  function computeRecords() {
    var dailyRows = buildDailyRows();
    var weeklyRows = buildWeeklyRows();

    var bestDay = null;
    dailyRows.forEach(function (r) {
      if (!bestDay || r.revenue > bestDay.revenue) bestDay = r;
    });

    var bestWeek = null;
    var goalWeeksCount = 0;
    var weekRevenueSum = 0;
    weeklyRows.forEach(function (w) {
      if (!bestWeek || w.revenue > bestWeek.revenue) bestWeek = w;
      if (w.goalMet) goalWeeksCount++;
      weekRevenueSum += w.revenue;
    });
    var avgWeek = weeklyRows.length ? weekRevenueSum / weeklyRows.length : 0;

    var highestSPH = null;
    dailyRows.forEach(function (r) {
      if (r.salesPerHour !== null && (!highestSPH || r.salesPerHour > highestSPH.salesPerHour)) highestSPH = r;
    });

    var streaks = computeStreaks(buildFilledWeeklyRows(weeklyRows));

    return {
      bestDay: bestDay,
      bestWeek: bestWeek,
      avgWeek: avgWeek,
      goalWeeksCount: goalWeeksCount,
      highestSPH: highestSPH,
      currentStreak: streaks.current,
      longestStreak: streaks.longest
    };
  }

  function computeForecast() {
    var weeklyRows = buildWeeklyRows().slice().sort(function (a, b) { return a.weekStart < b.weekStart ? 1 : -1; });
    var trailing = weeklyRows.slice(0, 4);
    var avgWeekly = trailing.length ? trailing.reduce(function (s, w) { return s + w.revenue; }, 0) / trailing.length : 0;
    var weeklyCommission = commissionForRevenue(avgWeekly);
    var WEEKS_PER_MONTH = 4.345;
    var WEEKS_PER_YEAR = 52;
    return {
      weekly: avgWeekly,
      monthly: avgWeekly * WEEKS_PER_MONTH,
      yearly: avgWeekly * WEEKS_PER_YEAR,
      weeklyCommission: weeklyCommission,
      monthlyCommission: weeklyCommission * WEEKS_PER_MONTH,
      yearlyCommission: weeklyCommission * WEEKS_PER_YEAR
    };
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
    var weekRow = weeklyRows.find(function (w) { return w.weekStart === weekStart; }) ||
      { revenue: 0, commission: 0, hours: 0, baseWages: 0, grossEarnings: 0 };

    var monthKey = today.slice(0, 7);
    var monthRow = monthlyRows.find(function (m) { return m.month === monthKey; }) || { revenue: 0, commission: 0 };

    var yearKey = today.slice(0, 4);
    var yearRow = yearlyRows.find(function (y) { return y.year === yearKey; }) || { revenue: 0, commission: 0 };

    document.getElementById("sumTodayRevenue").textContent = money(todayRevenue);
    document.getElementById("sumMonthRevenue").textContent = money(monthRow.revenue);
    document.getElementById("sumMonthCommission").textContent = "Commission: " + money(monthRow.commission);
    document.getElementById("sumYearRevenue").textContent = money(yearRow.revenue);
    document.getElementById("sumYearCommission").textContent = "Commission: " + money(yearRow.commission);

    // Weekly goal dashboard
    var goal = state.settings.weeklyGoal;
    var remaining = Math.max(0, goal - weekRow.revenue);
    var pct = goal > 0 ? (weekRow.revenue / goal) * 100 : 0;
    var elapsedDays = isoDayOfWeek(today);
    var daysRemaining = 8 - elapsedDays;
    var requiredPerDay = daysRemaining > 0 ? remaining / daysRemaining : 0;
    var avgPerDaySoFar = elapsedDays > 0 ? weekRow.revenue / elapsedDays : 0;
    var projectedWeekTotal = avgPerDaySoFar * 7;
    var onPace = projectedWeekTotal >= goal;

    document.getElementById("goalTarget").textContent = money(goal);
    document.getElementById("goalCurrent").textContent = money(weekRow.revenue);
    document.getElementById("goalRemaining").textContent = money(remaining);
    document.getElementById("goalPct").textContent = pct.toFixed(1) + "%";
    document.getElementById("goalProgressBar").style.width = Math.min(100, pct) + "%";
    document.getElementById("goalDaysRemaining").textContent = String(daysRemaining);
    document.getElementById("goalRequiredPerDay").textContent = money(requiredPerDay);
    var paceEl = document.getElementById("goalPaceStatus");
    paceEl.textContent = weekRow.revenue >= goal ? "Goal Hit" : (onPace ? "On Pace" : "Behind Pace");
    paceEl.className = "badge " + (weekRow.revenue >= goal ? "badge-good" : (onPace ? "badge-good" : "badge-bad"));

    // Earnings this week
    document.getElementById("earnQuota").textContent = money(state.settings.weeklyQuota);
    document.getElementById("earnOverQuota").textContent = money(weekRow.overQuota || 0);
    document.getElementById("earnCommission").textContent = money(weekRow.commission);
    document.getElementById("earnHours").textContent = (weekRow.hours || 0).toFixed(1);
    document.getElementById("earnBaseWages").textContent = money(weekRow.baseWages);
    document.getElementById("earnGrossEarnings").textContent = money(weekRow.grossEarnings);
    document.getElementById("earnGrossEarningsRow").textContent = money(weekRow.grossEarnings);
  }

  function renderRecords() {
    var records = computeRecords();
    var today = todayISO();

    document.getElementById("recBestDay").textContent = records.bestDay
      ? money(records.bestDay.revenue) + " (" + formatDate(records.bestDay.date) + ")" : "—";
    document.getElementById("recBestWeek").textContent = records.bestWeek
      ? money(records.bestWeek.revenue) + " (" + formatWeekLabel(records.bestWeek.weekStart) + ")" : "—";
    document.getElementById("recAvgWeek").textContent = money(records.avgWeek);
    document.getElementById("recGoalWeeksCount").textContent = String(records.goalWeeksCount);
    document.getElementById("recHighestSPH").textContent = records.highestSPH
      ? money(records.highestSPH.salesPerHour) + "/hr (" + formatDate(records.highestSPH.date) + ")" : "—";
    document.getElementById("recCurrentStreak").textContent = records.currentStreak + " week" + (records.currentStreak === 1 ? "" : "s");
    document.getElementById("recLongestStreak").textContent = records.longestStreak + " week" + (records.longestStreak === 1 ? "" : "s");

    var monthlyRows = buildMonthlyRows(buildWeeklyRows());
    var monthKey = today.slice(0, 7);
    var monthRevenue = (monthlyRows.find(function (m) { return m.month === monthKey; }) || { revenue: 0 }).revenue;
    var monthlyPct = state.settings.monthlyGoal > 0 ? (monthRevenue / state.settings.monthlyGoal) * 100 : 0;
    document.getElementById("recMonthlyTarget").textContent = money(state.settings.monthlyGoal);
    document.getElementById("recMonthlyPct").textContent = monthlyPct.toFixed(1) + "%";

    var yearlyRows = buildYearlyRows(buildWeeklyRows());
    var yearKey = today.slice(0, 4);
    var yearRevenue = (yearlyRows.find(function (y) { return y.year === yearKey; }) || { revenue: 0 }).revenue;
    var yearlyPct = state.settings.yearlyGoal > 0 ? (yearRevenue / state.settings.yearlyGoal) * 100 : 0;
    document.getElementById("recYearlyTarget").textContent = money(state.settings.yearlyGoal);
    document.getElementById("recYearlyPct").textContent = yearlyPct.toFixed(1) + "%";
  }

  function renderForecast() {
    var f = computeForecast();
    document.getElementById("fcWeekly").textContent = money(f.weekly);
    document.getElementById("fcMonthly").textContent = money(f.monthly);
    document.getElementById("fcYearly").textContent = money(f.yearly);
    document.getElementById("fcWeeklyCommission").textContent = money(f.weeklyCommission);
    document.getElementById("fcMonthlyCommission").textContent = money(f.monthlyCommission);
    document.getElementById("fcYearlyCommission").textContent = money(f.yearlyCommission);
  }

  // ---------- AI Sales Coach ----------
  // The app computes every number itself (goal pace, trends, records, etc.)
  // and sends only those already-computed figures to the server — the model
  // is asked to narrate/advise, never to do arithmetic, so it can't
  // hallucinate a dollar figure. No names, passcodes, or device info are
  // ever included in the payload.

  function buildCoachContext() {
    var today = todayISO();
    var weeklyRows = buildWeeklyRows();
    var dailyRowsDesc = buildDailyRows().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var weekStart = mondayOf(today);
    var currentWeek = weeklyRows.find(function (w) { return w.weekStart === weekStart; }) ||
      { revenue: 0, overQuota: 0, commission: 0, hours: 0, baseWages: 0, grossEarnings: 0, goalMet: false };

    var elapsedDays = isoDayOfWeek(today);
    var daysRemaining = 8 - elapsedDays;
    var remaining = Math.max(0, state.settings.weeklyGoal - currentWeek.revenue);
    var pctOfGoal = state.settings.weeklyGoal > 0 ? (currentWeek.revenue / state.settings.weeklyGoal) * 100 : 0;
    var avgPerDaySoFar = elapsedDays > 0 ? currentWeek.revenue / elapsedDays : 0;
    var requiredPerDay = daysRemaining > 0 ? remaining / daysRemaining : 0;
    var projectedWeekTotal = avgPerDaySoFar * 7;
    var onPace = projectedWeekTotal >= state.settings.weeklyGoal;

    var prevWeekStart = addDays(weekStart, -7);
    var prevWeek = weeklyRows.find(function (w) { return w.weekStart === prevWeekStart; });
    var lastWeekAvgPerDay = prevWeek ? prevWeek.revenue / 7 : null;
    var weekOverWeekPct = (prevWeek && prevWeek.revenue > 0)
      ? ((currentWeek.revenue - prevWeek.revenue) / prevWeek.revenue) * 100
      : null;

    var recentDaily = dailyRowsDesc.slice(0, 14);
    var recentWithHours = recentDaily.filter(function (d) { return d.salesPerHour !== null; });
    var recent3 = recentWithHours.slice(0, 3);
    var prior3 = recentWithHours.slice(3, 6);
    function avgSPH(list) {
      if (!list.length) return null;
      return list.reduce(function (s, d) { return s + d.salesPerHour; }, 0) / list.length;
    }
    var recentAvgSPH = avgSPH(recent3);
    var priorAvgSPH = avgSPH(prior3);
    var salesPerHourTrendPct = (recentAvgSPH !== null && priorAvgSPH) ? ((recentAvgSPH - priorAvgSPH) / priorAvgSPH) * 100 : null;

    var records = computeRecords();
    var forecast = computeForecast();

    var recentWeeklyRows = weeklyRows.slice().sort(function (a, b) { return a.weekStart < b.weekStart ? 1 : -1; }).slice(0, 8);
    var hasCompletedWeek = weeklyRows.some(function (w) { return w.weekStart !== weekStart; });

    function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
    function round1(n) { return n === null ? null : Math.round(Number(n) * 10) / 10; }

    return {
      today: today,
      goal: {
        weeklyGoal: state.settings.weeklyGoal,
        currentWeekRevenue: round2(currentWeek.revenue),
        remaining: round2(remaining),
        pctOfGoal: round1(pctOfGoal),
        elapsedDays: elapsedDays,
        daysRemaining: daysRemaining,
        avgPerDaySoFar: round2(avgPerDaySoFar),
        requiredPerDay: round2(requiredPerDay),
        projectedWeekTotal: round2(projectedWeekTotal),
        onPace: onPace,
        goalHit: currentWeek.revenue >= state.settings.weeklyGoal
      },
      commission: {
        threshold: state.settings.weeklyQuota,
        rate: state.settings.commissionRate,
        overThreshold: round2(currentWeek.overQuota || 0),
        commissionThisWeek: round2(currentWeek.commission),
        hourlyWage: state.settings.hourlyWage,
        hoursThisWeek: round2(currentWeek.hours || 0),
        baseWages: round2(currentWeek.baseWages || 0),
        grossEarnings: round2(currentWeek.grossEarnings || 0)
      },
      dailyHistory: recentDaily.map(function (d) {
        return { date: d.date, amount: round2(d.revenue), hours: round2(d.hours || 0), salesPerHour: d.salesPerHour !== null ? round2(d.salesPerHour) : null };
      }),
      weeklyHistory: recentWeeklyRows.map(function (w) {
        return { weekLabel: formatWeekLabel(w.weekStart), weekStart: w.weekStart, revenue: round2(w.revenue), goalMet: w.goalMet, commission: round2(w.commission) };
      }),
      trends: {
        weekOverWeekPct: round1(weekOverWeekPct),
        thisWeekAvgPerDay: round2(avgPerDaySoFar),
        lastWeekAvgPerDay: lastWeekAvgPerDay !== null ? round2(lastWeekAvgPerDay) : null,
        recentAvgSalesPerHour: recentAvgSPH !== null ? round2(recentAvgSPH) : null,
        priorAvgSalesPerHour: priorAvgSPH !== null ? round2(priorAvgSPH) : null,
        salesPerHourTrendPct: round1(salesPerHourTrendPct)
      },
      records: {
        bestDay: records.bestDay ? { date: records.bestDay.date, amount: round2(records.bestDay.revenue) } : null,
        bestWeek: records.bestWeek ? { weekLabel: formatWeekLabel(records.bestWeek.weekStart), amount: round2(records.bestWeek.revenue) } : null,
        avgWeek: round2(records.avgWeek),
        goalWeeksCount: records.goalWeeksCount,
        currentStreak: records.currentStreak,
        longestStreak: records.longestStreak,
        highestSalesPerHour: records.highestSPH ? { date: records.highestSPH.date, amount: round2(records.highestSPH.salesPerHour) } : null
      },
      forecast: {
        trailingWeeklyAvg: round2(forecast.weekly),
        projectedMonthly: round2(forecast.monthly),
        projectedYearly: round2(forecast.yearly)
      },
      hasCompletedWeek: hasCompletedWeek
    };
  }

  function showCoachState(name) {
    ["coachPlaceholder", "coachLoading", "coachError", "coachResults"].forEach(function (id) {
      var expected = "coach" + name.charAt(0).toUpperCase() + name.slice(1);
      document.getElementById(id).classList.toggle("hidden", id !== expected);
    });
    document.getElementById("coachAnalyzeBtn").disabled = (name === "loading") || state.sales.length === 0;
    state.coachResultsShown = (name === "results");
    if (name !== "results") {
      document.getElementById("coachStaleNote").classList.add("hidden");
    }
  }

  function renderCoachAvailability() {
    var hasData = state.sales.length > 0;
    document.getElementById("coachAnalyzeBtn").disabled = !hasData;
    var placeholder = document.getElementById("coachPlaceholder");
    if (!placeholder.classList.contains("hidden")) {
      placeholder.textContent = hasData
        ? "Click “Analyze My Performance” to get your personalized coaching insights."
        : "Log a few days of sales first, then I can analyze your performance.";
    }
  }

  function markCoachStale() {
    if (state.coachResultsShown) {
      document.getElementById("coachStaleNote").classList.remove("hidden");
    }
  }

  function renderCoachResults(analysis) {
    document.getElementById("coachSummary").textContent = analysis.performanceSummary || "";
    document.getElementById("coachGoalAnalysis").textContent = analysis.goalAnalysis || "";
    document.getElementById("coachNextShift").textContent = analysis.nextShiftPlan || "";
    document.getElementById("coachTrend").textContent = analysis.trendAnalysis || "";

    var adviceList = document.getElementById("coachAdvice");
    adviceList.innerHTML = "";
    (analysis.actionableAdvice || []).forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      adviceList.appendChild(li);
    });

    var weeklyBlock = document.getElementById("coachWeeklyReviewBlock");
    if (analysis.weeklyReview) {
      document.getElementById("coachWeeklyReview").textContent = analysis.weeklyReview;
      weeklyBlock.classList.remove("hidden");
    } else {
      weeklyBlock.classList.add("hidden");
    }

    document.getElementById("coachUpdatedAt").textContent =
      "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function runCoachAnalysis() {
    if (state.sales.length === 0) return;
    showCoachState("loading");
    var context = buildCoachContext();
    fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || "Something went wrong.");
        return data;
      });
    }).then(function (analysis) {
      renderCoachResults(analysis);
      showCoachState("results");
    }).catch(function (err) {
      document.getElementById("coachErrorMessage").textContent = err.message || "Couldn't reach the AI coach. Try again.";
      showCoachState("error");
    });
  }

  function getPeriodRows() {
    var weeklyRows = buildWeeklyRows();
    if (state.period === "daily") return buildDailyRows().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (state.period === "weekly") return weeklyRows.slice().sort(function (a, b) { return a.weekStart < b.weekStart ? 1 : -1; });
    if (state.period === "monthly") return buildMonthlyRows(weeklyRows).sort(function (a, b) { return a.month < b.month ? 1 : -1; });
    return buildYearlyRows(weeklyRows).sort(function (a, b) { return a.year < b.year ? 1 : -1; });
  }

  function chartValue(row) {
    if (state.chartMode === "commission") {
      if (state.period === "daily") return 0; // no per-day commission concept
      return row.commission || 0;
    }
    return row.revenue;
  }

  function renderChart() {
    var chartEl = document.getElementById("chart");
    chartEl.innerHTML = "";

    var rows = getPeriodRows().slice().reverse(); // chronological ascending
    var points = rows.slice(-8);

    if (points.length === 0 || (state.chartMode === "commission" && state.period === "daily")) {
      chartEl.innerHTML = '<p class="chart-empty">' +
        (state.chartMode === "commission" && state.period === "daily"
          ? "Commission is calculated weekly — switch to Weekly, Monthly, or Yearly to see it charted."
          : "No data yet.") +
        "</p>";
      return;
    }

    var values = points.map(chartValue);
    var max = Math.max.apply(null, values);
    max = max || 1;
    var goalLinePct = null;
    if (state.chartMode === "sales" && state.period === "weekly") {
      goalLinePct = Math.min(100, (state.settings.weeklyGoal / max) * 100);
    }

    points.forEach(function (r) {
      var value = chartValue(r);
      var pct = Math.max((value / max) * 100, 2);
      var wrap = document.createElement("div");
      wrap.className = "chart-bar-wrap";

      if (goalLinePct !== null) {
        var goalLine = document.createElement("div");
        goalLine.className = "chart-goal-line";
        goalLine.style.bottom = goalLinePct + "%";
        wrap.appendChild(goalLine);
      }

      var bar = document.createElement("div");
      bar.className = "chart-bar";
      bar.style.height = pct + "%";

      var label = document.createElement("div");
      label.className = "chart-bar-label";

      if (state.period === "daily") {
        bar.title = formatDate(r.date) + ": " + money(value);
        label.textContent = formatDate(r.date, { month: "short", day: "numeric" });
      } else if (state.period === "weekly") {
        bar.title = formatWeekLabel(r.weekStart) + ": " + money(value);
        label.textContent = formatDate(r.weekStart, { month: "short", day: "numeric" });
      } else if (state.period === "monthly") {
        bar.title = formatMonthLabel(r.month) + ": " + money(value);
        var mParts = r.month.split("-");
        label.textContent = MONTH_NAMES[parseInt(mParts[1], 10) - 1] + " " + mParts[0].slice(2);
      } else {
        bar.title = r.year + ": " + money(value);
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
    document.getElementById("chartTitle").textContent = titles[state.period] + (state.chartMode === "commission" ? " — Commission" : "");
    document.getElementById("breakdownTitle").textContent =
      state.period.charAt(0).toUpperCase() + state.period.slice(1) + " Breakdown";

    var head = document.getElementById("breakdownHead");
    var body = document.getElementById("breakdownBody");
    head.innerHTML = "";
    body.innerHTML = "";

    var headRow = document.createElement("tr");
    var columns;
    if (state.period === "daily") {
      columns = ["Date", "Sales Total", "Hours", "Sales/Hour", ""];
    } else if (state.period === "weekly") {
      columns = ["Week", "Sales Total", "Goal", "Commission", "Base Wages", "Gross Earnings"];
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
        tr.appendChild(td(row.hours ? row.hours.toFixed(1) : "—", "Hours"));
        tr.appendChild(td(row.salesPerHour !== null ? money(row.salesPerHour) : "—", "Sales/Hour"));

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
        tr.appendChild(td(row.goalMet ? "✓ Hit" : "—", "Goal"));
        tr.appendChild(td(money(row.commission), "Commission"));
        tr.appendChild(td(money(row.baseWages), "Base Wages"));
        tr.appendChild(td(money(row.grossEarnings), "Gross Earnings"));
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
    renderRecords();
    renderForecast();
    renderCoachAvailability();
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
    pushToServer();
    markCoachStale();
  }

  function deleteSale(id) {
    if (!confirm("Delete this day's total?")) return;
    state.sales = state.sales.filter(function (s) { return s.id !== id; });
    saveSales();
    renderAll();
    pushToServer();
    markCoachStale();
  }

  function startEdit(id) {
    var sale = state.sales.find(function (s) { return s.id === id; });
    if (!sale) return;
    state.editingId = id;

    document.getElementById("saleId").value = sale.id;
    document.getElementById("saleDate").value = sale.date;
    document.getElementById("saleAmount").value = sale.amount;
    document.getElementById("saleHours").value = sale.hours || "";

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
    document.getElementById("saleHours").value = "";
    document.getElementById("formTitle").textContent = "Add Daily Total";
    document.getElementById("submitBtn").textContent = "Save";
    document.getElementById("cancelEditBtn").classList.add("hidden");
    document.getElementById("saleAmount").focus();
  }

  // ---------- goal simulator (does not persist) ----------

  function runSimulator() {
    var hypothetical = parseFloat(document.getElementById("simAmount").value) || 0;
    var today = todayISO();
    var weekStart = mondayOf(today);
    var weekRow = buildWeeklyRows().find(function (w) { return w.weekStart === weekStart; }) || { revenue: 0 };

    var simTotal = weekRow.revenue + hypothetical;
    var goal = state.settings.weeklyGoal;
    var remaining = Math.max(0, goal - simTotal);
    var elapsedDays = isoDayOfWeek(today);
    var daysRemaining = 8 - elapsedDays;
    var requiredPerDay = daysRemaining > 0 ? remaining / daysRemaining : 0;

    document.getElementById("simWeekTotal").textContent = money(simTotal);
    document.getElementById("simRemaining").textContent = money(remaining);
    document.getElementById("simRequiredPerDay").textContent = money(requiredPerDay);
    document.getElementById("simCommission").textContent = money(commissionForRevenue(simTotal));
  }

  // ---------- CSV export ----------

  function exportCSV() {
    var rows = [["Date", "Sales Total", "Hours Worked"]];
    state.sales
      .slice()
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .forEach(function (s) { rows.push([s.date, s.amount, s.hours || 0]); });

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

  function populateSettingsInputs() {
    document.getElementById("weeklyGoal").value = state.settings.weeklyGoal;
    document.getElementById("weeklyQuota").value = state.settings.weeklyQuota;
    document.getElementById("commissionRate").value = state.settings.commissionRate;
    document.getElementById("hourlyWage").value = state.settings.hourlyWage;
    document.getElementById("monthlyGoal").value = state.settings.monthlyGoal;
    document.getElementById("yearlyGoal").value = state.settings.yearlyGoal;
  }

  function init() {
    state.sales = loadSales();
    state.settings = loadSettings();

    document.getElementById("saleDate").value = todayISO();
    populateSettingsInputs();
    document.getElementById("syncPasscode").value = loadPasscode();

    document.getElementById("saleForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var amount = parseFloat(document.getElementById("saleAmount").value);
      if (isNaN(amount) || amount < 0) return;
      var hours = parseFloat(document.getElementById("saleHours").value);

      var data = {
        date: document.getElementById("saleDate").value || todayISO(),
        amount: amount,
        hours: isNaN(hours) ? 0 : hours
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

    document.querySelectorAll("#chartModeTabs .filter-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#chartModeTabs .filter-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.chartMode = btn.getAttribute("data-mode");
        renderChart();
        renderBreakdown();
      });
    });

    document.getElementById("showAllBtn").addEventListener("click", function () {
      state.showAll = !state.showAll;
      renderBreakdown();
    });

    document.getElementById("exportBtn").addEventListener("click", exportCSV);

    document.getElementById("simBtn").addEventListener("click", runSimulator);

    document.getElementById("coachAnalyzeBtn").addEventListener("click", runCoachAnalysis);
    document.getElementById("coachRetryBtn").addEventListener("click", runCoachAnalysis);

    document.getElementById("settingsBtn").addEventListener("click", function () {
      document.getElementById("settingsPanel").classList.toggle("hidden");
    });
    document.getElementById("closeSettingsBtn").addEventListener("click", function () {
      document.getElementById("settingsPanel").classList.add("hidden");
    });
    document.getElementById("saveSettingsBtn").addEventListener("click", function () {
      function num(id, fallback) {
        var v = parseFloat(document.getElementById(id).value);
        return isNaN(v) ? fallback : v;
      }
      state.settings.weeklyGoal = num("weeklyGoal", DEFAULT_SETTINGS.weeklyGoal);
      state.settings.weeklyQuota = num("weeklyQuota", DEFAULT_SETTINGS.weeklyQuota);
      state.settings.commissionRate = num("commissionRate", DEFAULT_SETTINGS.commissionRate);
      state.settings.hourlyWage = num("hourlyWage", DEFAULT_SETTINGS.hourlyWage);
      state.settings.monthlyGoal = num("monthlyGoal", DEFAULT_SETTINGS.monthlyGoal);
      state.settings.yearlyGoal = num("yearlyGoal", DEFAULT_SETTINGS.yearlyGoal);
      saveSettings();
      document.getElementById("settingsPanel").classList.add("hidden");
      renderAll();
      pushToServer();
      markCoachStale();
    });

    document.getElementById("syncConnectBtn").addEventListener("click", function () {
      var passcode = document.getElementById("syncPasscode").value.trim();
      savePasscode(passcode);
      if (!passcode) {
        setSyncStatus("Sync off — using this device's local data only");
        return;
      }
      setSyncStatus("Connecting…");
      pullFromServer().then(function () {
        populateSettingsInputs();
        renderAll();
      });
    });

    if (loadPasscode()) {
      setSyncStatus("Connecting…");
      pullFromServer().then(function () {
        populateSettingsInputs();
        renderAll();
      });
    } else {
      renderAll();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
