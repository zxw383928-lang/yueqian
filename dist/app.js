(function () {
  "use strict";

  const STORAGE_KEY = "yueqian-state-v1";
  const ORBIT_LENGTH = 339.292;
  const DAY_MS = 86400000;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let state = loadState();
  let activeFilter = "all";
  let timerInterval = null;
  let deferredInstallPrompt = null;

  const elements = {
    headerDate: $("#headerDate"),
    greeting: $("#greeting"),
    dailyPrompt: $("#dailyPrompt"),
    streakValue: $("#streakValue"),
    focusValue: $("#focusValue"),
    doneCount: $("#doneCount"),
    goalCount: $("#goalCount"),
    orbitProgress: $("#orbitProgress"),
    orbitDesc: $("#orbitDesc"),
    levelLabel: $("#levelLabel"),
    levelBar: $("#levelBar"),
    taskForm: $("#taskForm"),
    taskTitle: $("#taskTitle"),
    taskSubject: $("#taskSubject"),
    taskMinutes: $("#taskMinutes"),
    taskList: $("#taskList"),
    taskTemplate: $("#taskTemplate"),
    emptyTasks: $("#emptyTasks"),
    completionRate: $("#completionRate"),
    reviewHint: $("#reviewHint"),
    suggestButton: $("#suggestButton"),
    focusTask: $("#focusTask"),
    timerDisplay: $("#timerDisplay"),
    timerCaption: $("#timerCaption"),
    timerRing: $("#timerRing"),
    timerStatus: $("#timerStatus"),
    toggleTimer: $("#toggleTimer"),
    resetTimer: $("#resetTimer"),
    finishTimer: $("#finishTimer"),
    todayFocusLarge: $("#todayFocusLarge"),
    focusGoalBar: $("#focusGoalBar"),
    focusGoalHint: $("#focusGoalHint"),
    weekXp: $("#weekXp"),
    weekFocusTotal: $("#weekFocusTotal"),
    weekDone: $("#weekDone"),
    weekSessions: $("#weekSessions"),
    bestDay: $("#bestDay"),
    weekChart: $("#weekChart"),
    achievementList: $("#achievementList"),
    weeklyInsight: $("#weeklyInsight"),
    profileName: $("#profileName"),
    dailyGoal: $("#dailyGoal"),
    focusGoal: $("#focusGoal"),
    saveSettings: $("#saveSettings"),
    exportData: $("#exportData"),
    importData: $("#importData"),
    resetData: $("#resetData"),
    confirmDialog: $("#confirmDialog"),
    confirmReset: $("#confirmReset"),
    installButton: $("#installButton"),
    toastRegion: $("#toastRegion")
  };

  init();

  function init() {
    applyTheme();
    bindEvents();
    reconcileTimer();
    renderAll();
    const requestedView = window.location.hash.slice(1);
    showView(["today", "focus", "review", "settings"].includes(requestedView) ? requestedView : "today", false);
    registerServiceWorker();
  }

  function bindEvents() {
    $$('[data-view-target]').forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.viewTarget));
    });

    elements.taskForm.addEventListener("submit", addTask);
    elements.suggestButton.addEventListener("click", suggestTask);

    $$(".filter-tab").forEach((button) => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        $$(".filter-tab").forEach((tab) => {
          const selected = tab === button;
          tab.classList.toggle("active", selected);
          tab.setAttribute("aria-pressed", String(selected));
        });
        renderTasks();
      });
    });

    $$(".preset").forEach((button) => {
      button.addEventListener("click", () => selectTimerPreset(button));
    });

    elements.toggleTimer.addEventListener("click", toggleTimer);
    elements.resetTimer.addEventListener("click", resetTimer);
    elements.finishTimer.addEventListener("click", finishTimerEarly);
    elements.focusTask.addEventListener("change", () => {
      state.timer.taskId = elements.focusTask.value || null;
      saveState();
    });

    elements.saveSettings.addEventListener("click", saveSettings);
    $$('[data-theme-choice]').forEach((button) => {
      button.addEventListener("click", () => {
        state.profile.theme = button.dataset.themeChoice;
        applyTheme();
        saveState();
        renderSettings();
      });
    });

    elements.exportData.addEventListener("click", exportData);
    elements.importData.addEventListener("change", importData);
    elements.resetData.addEventListener("click", () => elements.confirmDialog.showModal());
    elements.confirmReset.addEventListener("click", resetAllData);

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      elements.installButton.hidden = false;
    });

    elements.installButton.addEventListener("click", installApp);
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      elements.installButton.hidden = true;
      showToast("跃迁已安装到桌面");
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) reconcileTimer();
    });
  }

  function defaultState() {
    const today = dateKey(new Date());
    return {
      version: 1,
      profile: {
        name: "同学",
        xp: 0,
        dailyGoal: 3,
        focusGoal: 60,
        theme: "system"
      },
      tasks: [
        createTask("整理今天最容易错的一道题", "数学", 20, today),
        createTask("背 15 个高频英语单词", "英语", 20, today),
        createTask("为想做的安卓项目写 3 条需求", "编程", 10, today)
      ],
      sessions: [],
      timer: {
        selectedMinutes: 25,
        remaining: 25 * 60,
        running: false,
        endAt: null,
        kind: "focus",
        taskId: null
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!isValidState(parsed)) return defaultState();
      const defaults = defaultState();
      return {
        ...defaults,
        ...parsed,
        profile: { ...defaults.profile, ...parsed.profile },
        timer: { ...defaults.timer, ...parsed.timer },
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : defaults.tasks,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
      };
    } catch (error) {
      console.warn("无法读取本地数据，将使用初始状态。", error);
      return defaultState();
    }
  }

  function isValidState(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      value.profile &&
      Array.isArray(value.tasks) &&
      Array.isArray(value.sessions)
    );
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("无法保存本地数据。", error);
      showToast("保存失败，请检查浏览器存储空间", "warning");
    }
  }

  function createTask(title, subject, minutes, day = dateKey(new Date())) {
    return {
      id: uniqueId(),
      title,
      subject,
      minutes: Number(minutes),
      date: day,
      createdAt: new Date().toISOString(),
      completed: false,
      completedAt: null,
      xp: taskXp(Number(minutes))
    };
  }

  function uniqueId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function taskXp(minutes) {
    return Math.min(25, 10 + Math.max(2, Math.round(minutes / 5)));
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
  }

  function lastSevenDays() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, index - 6);
      return { key: dateKey(date), date };
    });
  }

  function renderAll() {
    renderHeader();
    renderDashboard();
    renderTasks();
    renderFocus();
    renderReview();
    renderSettings();
  }

  function renderHeader() {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
    elements.headerDate.textContent = `${now.getMonth() + 1}月${now.getDate()}日 · ${weekday}`;

    const hour = now.getHours();
    const period = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
    const name = (state.profile.name || "同学").trim();
    elements.greeting.textContent = `${period}，${name}`;

    const level = Math.floor(state.profile.xp / 100) + 1;
    const progress = state.profile.xp % 100;
    elements.levelLabel.textContent = `LV.${level}`;
    elements.levelBar.style.width = `${progress}%`;
  }

  function getTodayTasks() {
    const today = dateKey(new Date());
    return state.tasks.filter((task) => {
      if (task.completed) return completionDate(task) === today;
      return !task.date || task.date <= today;
    });
  }

  function completionDate(task) {
    return task.completedAt ? dateKey(new Date(task.completedAt)) : null;
  }

  function completedToday() {
    const today = dateKey(new Date());
    return state.tasks.filter((task) => task.completed && completionDate(task) === today);
  }

  function focusMinutesFor(dayKey) {
    return state.sessions
      .filter((session) => session.date === dayKey && session.kind !== "break")
      .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
  }

  function renderDashboard() {
    const today = dateKey(new Date());
    const done = completedToday().length;
    const goal = Number(state.profile.dailyGoal) || 3;
    const focusMinutes = focusMinutesFor(today);
    const streak = calculateStreak();
    const progress = Math.min(done / goal, 1);
    const todayTasks = getTodayTasks();
    const total = todayTasks.length;
    const rate = total ? Math.round((done / total) * 100) : 0;

    elements.doneCount.textContent = String(done);
    elements.goalCount.textContent = String(goal);
    elements.streakValue.textContent = String(streak);
    elements.focusValue.textContent = String(focusMinutes);
    elements.orbitProgress.style.strokeDashoffset = String(ORBIT_LENGTH * (1 - progress));
    elements.orbitDesc.textContent = `已完成 ${done} 项，目标 ${goal} 项`;
    elements.completionRate.textContent = `${rate}%`;

    if (done >= goal) {
      elements.dailyPrompt.textContent = "今日重点已经完成，剩下的时间可以安心巩固或休息。";
      elements.reviewHint.textContent = "重点任务已达标，今天的推进很扎实。";
    } else if (done > 0) {
      elements.dailyPrompt.textContent = `已经启动，再完成 ${goal - done} 项就达成今日目标。`;
      elements.reviewHint.textContent = `已推进 ${done} 项，保持现在的节奏。`;
    } else {
      elements.dailyPrompt.textContent = "先完成一项短任务，让状态启动起来。";
      elements.reviewHint.textContent = "完成第一项后，这里会显示你的节奏。";
    }
  }

  function renderTasks() {
    const tasks = getTodayTasks()
      .filter((task) => {
        if (activeFilter === "open") return !task.completed;
        if (activeFilter === "done") return task.completed;
        return true;
      })
      .sort((a, b) => Number(a.completed) - Number(b.completed) || new Date(a.createdAt) - new Date(b.createdAt));

    elements.taskList.replaceChildren();
    elements.emptyTasks.hidden = tasks.length > 0;

    tasks.forEach((task) => {
      const fragment = elements.taskTemplate.content.cloneNode(true);
      const item = $(".task-item", fragment);
      const check = $(".task-check", fragment);
      const focus = $(".task-focus", fragment);
      const remove = $(".task-delete", fragment);

      item.dataset.taskId = task.id;
      item.classList.toggle("completed", Boolean(task.completed));
      $(".task-title", fragment).textContent = task.title;
      $(".subject-badge", fragment).textContent = task.subject || "其他";
      $(".task-duration", fragment).textContent = `${task.minutes || 20} 分钟`;
      $(".task-xp", fragment).textContent = `+${task.xp || taskXp(task.minutes)} XP`;
      check.setAttribute("aria-label", task.completed ? `取消完成：${task.title}` : `完成任务：${task.title}`);
      focus.setAttribute("aria-label", `专注处理：${task.title}`);
      remove.setAttribute("aria-label", `删除任务：${task.title}`);

      check.addEventListener("click", () => toggleTask(task.id));
      focus.addEventListener("click", () => focusOnTask(task.id));
      remove.addEventListener("click", () => deleteTask(task.id));
      elements.taskList.appendChild(fragment);
    });

    renderFocusTaskOptions();
  }

  function addTask(event) {
    event.preventDefault();
    const title = elements.taskTitle.value.trim();
    if (!title) return;

    const task = createTask(title, elements.taskSubject.value, Number(elements.taskMinutes.value));
    state.tasks.push(task);
    saveState();
    elements.taskForm.reset();
    elements.taskMinutes.value = "20";
    renderAll();
    showToast("已加入今日任务");
    elements.taskTitle.focus();
  }

  function toggleTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;

    const wasComplete = Boolean(task.completed);
    const xp = Number(task.xp || taskXp(task.minutes));
    task.completed = !wasComplete;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    task.xp = xp;
    state.profile.xp = Math.max(0, Number(state.profile.xp || 0) + (task.completed ? xp : -xp));
    saveState();
    renderAll();

    if (task.completed) {
      const goalReached = completedToday().length === Number(state.profile.dailyGoal);
      showToast(goalReached ? `今日重点达成 · +${xp} XP` : `完成一项 · +${xp} XP`);
    } else {
      showToast("已恢复为待完成", "warning");
    }
  }

  function deleteTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    if (!window.confirm(`删除“${task.title}”？`)) return;

    if (task.completed) {
      state.profile.xp = Math.max(0, Number(state.profile.xp || 0) - Number(task.xp || 0));
    }
    state.tasks = state.tasks.filter((item) => item.id !== id);
    if (state.timer.taskId === id) state.timer.taskId = null;
    saveState();
    renderAll();
    showToast("任务已删除", "warning");
  }

  function suggestTask() {
    const suggestions = [
      ["把今天最难的一道题重新独立做一遍", "数学", 20],
      ["用自己的话总结今天学到的一个知识点", "其他", 10],
      ["复习 15 个英语单词并口头造句", "英语", 20],
      ["整理桌面和明天要用的书本", "生活", 10],
      ["为自己的项目完成一个最小功能", "编程", 30],
      ["读一篇课文并写下三个关键词", "语文", 20],
      ["关掉通知，完成一次 25 分钟专注", "其他", 25]
    ];
    const openTitles = new Set(state.tasks.filter((task) => !task.completed).map((task) => task.title));
    const candidates = suggestions.filter(([title]) => !openTitles.has(title));
    const pool = candidates.length ? candidates : suggestions;
    const [title, subject, minutes] = pool[Math.floor(Math.random() * pool.length)];
    elements.taskTitle.value = title;
    elements.taskSubject.value = subject;
    elements.taskMinutes.value = String(minutes);
    elements.taskTitle.focus();
    showToast("已生成一个可在今天完成的小目标");
  }

  function showView(viewName, updateHash = true) {
    $$(".view").forEach((view) => {
      const active = view.dataset.view === viewName;
      view.hidden = !active;
      view.classList.toggle("active", active);
    });

    $$(".nav-item").forEach((button) => {
      const active = button.dataset.viewTarget === viewName;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    if (viewName === "review") renderReview();
    if (viewName === "focus") renderFocus();
    if (viewName === "settings") renderSettings();
    if (updateHash && window.location.hash !== `#${viewName}`) {
      window.history.replaceState(null, "", `#${viewName}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function focusOnTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    state.timer.taskId = id;
    const preset = [25, 45, 60].find((minutes) => minutes >= Number(task.minutes)) || 60;
    if (!state.timer.running) {
      state.timer.selectedMinutes = preset;
      state.timer.remaining = preset * 60;
      state.timer.kind = "focus";
    }
    saveState();
    showView("focus");
    showToast(`已选择：${task.title}`);
  }

  function renderFocusTaskOptions() {
    const current = state.timer.taskId;
    const tasks = state.tasks.filter((task) => !task.completed && (!task.date || task.date <= dateKey(new Date())));
    elements.focusTask.replaceChildren();

    const freeOption = document.createElement("option");
    freeOption.value = "";
    freeOption.textContent = "自由专注（不关联任务）";
    elements.focusTask.appendChild(freeOption);

    tasks.forEach((task) => {
      const option = document.createElement("option");
      option.value = task.id;
      option.textContent = task.title;
      elements.focusTask.appendChild(option);
    });

    elements.focusTask.value = tasks.some((task) => task.id === current) ? current : "";
    if (!elements.focusTask.value && current) {
      state.timer.taskId = null;
      saveState();
    }
  }

  function selectTimerPreset(button) {
    if (state.timer.running) {
      showToast("请先暂停计时，再切换时长", "warning");
      return;
    }
    const minutes = Number(button.dataset.minutes);
    state.timer.selectedMinutes = minutes;
    state.timer.remaining = minutes * 60;
    state.timer.kind = button.dataset.kind === "break" ? "break" : "focus";
    state.timer.endAt = null;
    saveState();
    renderFocus();
  }

  function toggleTimer() {
    if (state.timer.running) pauseTimer();
    else startTimer();
  }

  function startTimer() {
    if (state.timer.remaining <= 0) state.timer.remaining = state.timer.selectedMinutes * 60;
    state.timer.running = true;
    state.timer.endAt = Date.now() + state.timer.remaining * 1000;
    saveState();
    startTimerLoop();
    renderFocus();
    showToast(state.timer.kind === "break" ? "休息计时开始" : "专注开始，暂时只做这一件事");
  }

  function pauseTimer() {
    syncRemaining();
    state.timer.running = false;
    state.timer.endAt = null;
    clearInterval(timerInterval);
    timerInterval = null;
    saveState();
    renderFocus();
  }

  function resetTimer() {
    state.timer.running = false;
    state.timer.endAt = null;
    state.timer.remaining = state.timer.selectedMinutes * 60;
    clearInterval(timerInterval);
    timerInterval = null;
    saveState();
    renderFocus();
    showToast("计时器已重置", "warning");
  }

  function finishTimerEarly() {
    const fullSeconds = state.timer.selectedMinutes * 60;
    if (!state.timer.running && state.timer.remaining === fullSeconds) {
      showToast("计时尚未开始", "warning");
      return;
    }
    if (state.timer.running) syncRemaining();
    const elapsedSeconds = Math.max(0, fullSeconds - state.timer.remaining);
    if (elapsedSeconds < 60) {
      showToast("至少专注 1 分钟后再记录", "warning");
      return;
    }
    completeTimer(Math.max(1, Math.round(elapsedSeconds / 60)));
  }

  function reconcileTimer() {
    if (!state.timer.running || !state.timer.endAt) {
      renderTimerDisplay();
      return;
    }
    syncRemaining();
    if (state.timer.remaining <= 0) completeTimer(state.timer.selectedMinutes, true);
    else startTimerLoop();
  }

  function startTimerLoop() {
    clearInterval(timerInterval);
    timerInterval = window.setInterval(() => {
      syncRemaining();
      if (state.timer.remaining <= 0) completeTimer(state.timer.selectedMinutes, true);
      else renderTimerDisplay();
    }, 1000);
  }

  function syncRemaining() {
    if (!state.timer.running || !state.timer.endAt) return;
    state.timer.remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
  }

  function completeTimer(minutes, automatic = false) {
    const kind = state.timer.kind;
    const taskId = state.timer.taskId;
    const safeMinutes = Math.max(1, Math.round(Number(minutes)));
    state.timer.running = false;
    state.timer.endAt = null;
    state.timer.remaining = state.timer.selectedMinutes * 60;
    clearInterval(timerInterval);
    timerInterval = null;

    const xp = kind === "break" ? 0 : Math.max(5, Math.min(25, Math.round(safeMinutes / 2)));
    state.sessions.push({
      id: uniqueId(),
      date: dateKey(new Date()),
      minutes: safeMinutes,
      kind,
      taskId,
      xp,
      endedAt: new Date().toISOString()
    });
    state.profile.xp += xp;
    saveState();
    renderAll();
    document.title = "跃迁｜任务与专注";
    showToast(kind === "break" ? "休息结束，可以开始下一轮了" : `专注完成 · ${safeMinutes} 分钟 · +${xp} XP`);
    if (automatic) signalTimerFinished();
  }

  function signalTimerFinished() {
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.35);
    } catch (_) {
      // Sound is an enhancement; browsers may block it when the page is inactive.
    }
  }

  function renderFocus() {
    renderFocusTaskOptions();
    renderTimerDisplay();
    const todayMinutes = focusMinutesFor(dateKey(new Date()));
    const goal = Number(state.profile.focusGoal) || 60;
    const remaining = Math.max(0, goal - todayMinutes);
    elements.todayFocusLarge.textContent = String(todayMinutes);
    elements.focusGoalBar.style.width = `${Math.min(100, (todayMinutes / goal) * 100)}%`;
    elements.focusGoalHint.textContent = remaining > 0 ? `距离 ${goal} 分钟目标还有 ${remaining} 分钟` : `已达成 ${goal} 分钟目标`;
  }

  function renderTimerDisplay() {
    if (!elements.timerDisplay) return;
    const minutes = Math.floor(state.timer.remaining / 60);
    const seconds = state.timer.remaining % 60;
    elements.timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    const total = state.timer.selectedMinutes * 60;
    const elapsedRatio = total ? Math.max(0, Math.min(1, (total - state.timer.remaining) / total)) : 0;
    elements.timerRing.style.setProperty("--timer-progress", `${elapsedRatio * 360}deg`);
    elements.timerCaption.textContent = state.timer.kind === "break" ? "让大脑真正休息一下" : "一次完整的专注冲刺";

    elements.toggleTimer.classList.toggle("running", state.timer.running);
    $("span", elements.toggleTimer).textContent = state.timer.running ? "暂停一下" : state.timer.remaining < total ? "继续专注" : "开始专注";
    elements.timerStatus.classList.toggle("running", state.timer.running);
    elements.timerStatus.lastChild.textContent = state.timer.running ? "专注进行中" : state.timer.remaining < total ? "已暂停" : "准备就绪";

    $$(".preset").forEach((button) => {
      const selected = Number(button.dataset.minutes) === Number(state.timer.selectedMinutes) &&
        (button.dataset.kind === "break") === (state.timer.kind === "break");
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    document.title = state.timer.running ? `${elements.timerDisplay.textContent}｜跃迁` : "跃迁｜任务与专注";
  }

  function activityDates() {
    const active = new Set();
    state.tasks.forEach((task) => {
      const completed = completionDate(task);
      if (completed) active.add(completed);
    });
    state.sessions.forEach((session) => {
      if (session.kind !== "break" && session.date) active.add(session.date);
    });
    return active;
  }

  function calculateStreak() {
    const active = activityDates();
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!active.has(dateKey(cursor))) cursor = addDays(cursor, -1);
    let streak = 0;
    while (active.has(dateKey(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function renderReview() {
    const days = lastSevenDays();
    const dayKeys = new Set(days.map((day) => day.key));
    const completed = state.tasks.filter((task) => task.completed && dayKeys.has(completionDate(task)));
    const sessions = state.sessions.filter((session) => session.kind !== "break" && dayKeys.has(session.date));
    const focusTotal = sessions.reduce((sum, session) => sum + Number(session.minutes || 0), 0);
    const xpTotal = completed.reduce((sum, task) => sum + Number(task.xp || 0), 0) +
      sessions.reduce((sum, session) => sum + Number(session.xp || 0), 0);

    elements.weekXp.textContent = `${xpTotal} XP`;
    elements.weekFocusTotal.textContent = `${focusTotal} 分钟`;
    elements.weekDone.textContent = String(completed.length);
    elements.weekSessions.textContent = String(sessions.length);

    const dailyScores = days.map((day) => ({
      ...day,
      minutes: focusMinutesFor(day.key),
      tasks: completed.filter((task) => completionDate(task) === day.key).length
    }));
    const best = dailyScores.reduce((winner, day) => {
      const score = day.minutes + day.tasks * 10;
      return score > winner.score ? { score, day } : winner;
    }, { score: 0, day: null });
    elements.bestDay.textContent = best.day ? new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(best.day.date) : "—";

    renderWeekChart(dailyScores);
    renderAchievements(focusTotal);
    renderInsight({ completed: completed.length, sessions: sessions.length, focusTotal, dailyScores });
  }

  function renderWeekChart(days) {
    const maxMinutes = Math.max(60, ...days.map((day) => day.minutes));
    const today = dateKey(new Date());
    elements.weekChart.replaceChildren();

    days.forEach((day) => {
      const column = document.createElement("div");
      const bar = document.createElement("div");
      const value = document.createElement("em");
      const label = document.createElement("span");
      const isToday = day.key === today;
      column.className = "chart-day";
      bar.className = `chart-bar${isToday ? " today" : ""}`;
      bar.style.height = `${Math.max(3, (day.minutes / maxMinutes) * 100)}%`;
      bar.setAttribute("aria-label", `${weekdayShort(day.date)}专注 ${day.minutes} 分钟`);
      value.textContent = String(day.minutes);
      label.textContent = weekdayShort(day.date);
      label.classList.toggle("today", isToday);
      bar.appendChild(value);
      column.append(bar, label);
      elements.weekChart.appendChild(column);
    });
  }

  function weekdayShort(date) {
    return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date).replace("周", "");
  }

  function renderAchievements(weekFocus) {
    const streak = calculateStreak();
    const totalFocus = state.sessions
      .filter((session) => session.kind !== "break")
      .reduce((sum, session) => sum + Number(session.minutes || 0), 0);
    const totalDone = state.tasks.filter((task) => task.completed).length;
    const achievements = [
      { icon: "✓", title: "第一次推进", description: "完成 1 项任务", unlocked: totalDone >= 1 },
      { icon: "◷", title: "进入深水区", description: "累计专注 100 分钟", unlocked: totalFocus >= 100 },
      { icon: "↗", title: "稳定发生", description: "连续推进 3 天", unlocked: streak >= 3 }
    ];

    elements.achievementList.replaceChildren();
    achievements.forEach((achievement) => {
      const card = document.createElement("div");
      card.className = `achievement${achievement.unlocked ? "" : " locked"}`;
      const icon = document.createElement("span");
      const title = document.createElement("strong");
      const description = document.createElement("small");
      icon.textContent = achievement.unlocked ? achievement.icon : "·";
      title.textContent = achievement.title;
      description.textContent = achievement.unlocked ? "已解锁" : achievement.description;
      card.append(icon, title, description);
      elements.achievementList.appendChild(card);
    });

    void weekFocus;
  }

  function renderInsight({ completed, sessions, focusTotal, dailyScores }) {
    if (!completed && !sessions) {
      elements.weeklyInsight.textContent = "先完成几项任务，我会根据你的实际记录给出一条简短建议。";
      return;
    }

    const activeDays = dailyScores.filter((day) => day.minutes > 0 || day.tasks > 0).length;
    const strongest = dailyScores.reduce((winner, day) => {
      const score = day.minutes + day.tasks * 10;
      return score > winner.score ? { score, day } : winner;
    }, { score: -1, day: dailyScores[0] });

    if (activeDays >= 5) {
      elements.weeklyInsight.textContent = `最近 7 天里有 ${activeDays} 天留下了推进记录，稳定性已经形成。下周继续守住“每天至少完成一件”的底线。`;
    } else if (focusTotal >= 120) {
      elements.weeklyInsight.textContent = `本周已经专注 ${focusTotal} 分钟。${weekdayShort(strongest.day.date)}的投入最高，可以回想一下那天哪些环境设置最有效。`;
    } else if (completed >= 3) {
      elements.weeklyInsight.textContent = `你完成了 ${completed} 项任务。下一步可以把较大的任务拆成 20–30 分钟的小块，开始会更轻。`;
    } else {
      elements.weeklyInsight.textContent = "你已经开始留下真实记录。先不增加任务量，尝试连续三天各推进一件小事。";
    }
  }

  function renderSettings() {
    elements.profileName.value = state.profile.name || "";
    elements.dailyGoal.value = String(state.profile.dailyGoal || 3);
    elements.focusGoal.value = String(state.profile.focusGoal || 60);
    $$('[data-theme-choice]').forEach((button) => {
      button.classList.toggle("active", button.dataset.themeChoice === state.profile.theme);
    });
  }

  function saveSettings() {
    state.profile.name = elements.profileName.value.trim() || "同学";
    state.profile.dailyGoal = Number(elements.dailyGoal.value);
    state.profile.focusGoal = Number(elements.focusGoal.value);
    saveState();
    renderAll();
    showToast("设置已保存");
  }

  function applyTheme() {
    const choice = state.profile.theme || "system";
    const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = choice === "system" ? (systemDark ? "dark" : "light") : choice;
    document.documentElement.dataset.theme = resolved;
    const color = resolved === "dark" ? "#08111f" : "#edf2f7";
    const themeMeta = $('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", color);
  }

  function exportData() {
    const payload = {
      ...state,
      exportedAt: new Date().toISOString(),
      app: "跃迁"
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `跃迁备份-${dateKey(new Date())}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("数据备份已导出");
  }

  async function importData(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!isValidState(imported)) throw new Error("invalid-state");
      state = {
        ...defaultState(),
        ...imported,
        profile: { ...defaultState().profile, ...imported.profile },
        timer: { ...defaultState().timer, ...imported.timer, running: false, endAt: null }
      };
      saveState();
      applyTheme();
      renderAll();
      showToast("数据恢复成功");
    } catch (_) {
      showToast("无法导入：请选择由跃迁导出的 JSON 文件", "warning");
    } finally {
      event.target.value = "";
    }
  }

  function resetAllData() {
    clearInterval(timerInterval);
    timerInterval = null;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    applyTheme();
    saveState();
    renderAll();
    showView("today");
    showToast("已恢复到初始状态", "warning");
  }

  async function installApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast${type === "warning" ? " warning" : ""}`;
    toast.textContent = message;
    elements.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("离线功能注册失败。", error);
      });
    });
  }
})();
