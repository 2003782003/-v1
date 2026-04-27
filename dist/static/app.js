// ورشة شويخ - Frontend SPA
(function () {
  'use strict';

  const api = axios.create({ baseURL: '/api', withCredentials: true });
  const state = {
    user: null,
    route: 'login',
    subRoute: null,
    engines: [],
    customers: [],
    technicians: [],
    spareParts: [],
    conversations: [],
    activeChatUserId: null,
    notifications: [],
    unreadMessages: 0,
    unreadNotifications: 0,
    stats: {},
    filters: { engineStatus: 'all' }
  };

  // ============ UTILITIES ============

  function $(sel, parent = document) { return parent.querySelector(sel); }
  function $$(sel, parent = document) { return parent.querySelectorAll(sel); }
  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function formatDZD(n) {
    if (!n) return '0 دج';
    return Number(n).toLocaleString('ar-DZ') + ' دج';
  }
  function formatDate(s) {
    if (!s) return '-';
    try { return dayjs(s).format('YYYY-MM-DD'); } catch { return s; }
  }
  function formatDateTime(s) {
    if (!s) return '-';
    try { return dayjs(s).format('YYYY-MM-DD HH:mm'); } catch { return s; }
  }
  function statusLabel(s) {
    return ({
      unrepaired: 'غير مصلح',
      in_progress: 'قيد التصليح',
      ready: 'جاهز',
      delivered: 'تم التسليم'
    })[s] || s;
  }
  function statusClass(s) {
    return ({
      unrepaired: 'status-unrepaired',
      in_progress: 'status-inprogress',
      ready: 'status-ready',
      delivered: 'status-delivered'
    })[s] || 'status-unrepaired';
  }

  function toast(msg, type = 'info') {
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500', warning: 'bg-yellow-500' };
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const el = h(`<div class="toast ${colors[type]} text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-3">
      <i class="fas ${icons[type]}"></i><span>${escapeHtml(msg)}</span></div>`);
    $('#toastContainer').appendChild(el);
    setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 300); }, 3500);
  }

  function modal(content, options = {}) {
    const wrap = h(`<div class="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm fade-in">
      <div class="card p-6 w-full max-w-lg max-h-[90vh] overflow-auto">${content}</div></div>`);
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    $('#modalContainer').appendChild(wrap);
    return wrap;
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ============ AUTH ============

  async function checkAuth() {
    try {
      const { data } = await api.get('/auth/me');
      if (data.user) {
        state.user = data.user;
        await loadInitialData();
        state.route = 'dashboard';
        render();
        startPolling();
      } else {
        state.route = 'login';
        render();
      }
    } catch {
      state.route = 'login';
      render();
    }
  }

  async function login(username, password) {
    try {
      const { data } = await api.post('/auth/login', { username, password });
      state.user = data.user;
      await loadInitialData();
      state.route = 'dashboard';
      toast('تم تسجيل الدخول بنجاح', 'success');
      render();
      startPolling();
    } catch (e) {
      toast(e.response?.data?.error || 'فشل تسجيل الدخول', 'error');
    }
  }

  async function register(payload) {
    try {
      const { data } = await api.post('/auth/register', payload);
      state.user = data.user;
      await loadInitialData();
      state.route = 'dashboard';
      toast('تم إنشاء الحساب بنجاح', 'success');
      render();
      startPolling();
    } catch (e) {
      toast(e.response?.data?.error || 'فشل إنشاء الحساب', 'error');
    }
  }

  async function logout() {
    try { await api.post('/auth/logout'); } catch { }
    state.user = null;
    state.route = 'login';
    stopPolling();
    toast('تم تسجيل الخروج', 'info');
    render();
  }

  // ============ DATA LOADING ============

  async function loadInitialData() {
    const tasks = [loadEngines(), loadNotifications(), loadUnreadMessages()];
    if (state.user.role !== 'customer') tasks.push(loadCustomers(), loadStats());
    if (state.user.role === 'admin') tasks.push(loadTechnicians());
    await Promise.all(tasks);
  }

  async function loadEngines() {
    try {
      const { data } = await api.get('/engines');
      state.engines = data.engines || [];
    } catch { state.engines = []; }
  }

  async function loadCustomers() {
    try {
      const { data } = await api.get('/users?role=customer');
      state.customers = data.users || [];
    } catch { state.customers = []; }
  }

  async function loadTechnicians() {
    try {
      const { data } = await api.get('/users?role=technician');
      state.technicians = data.users || [];
    } catch { state.technicians = []; }
  }

  async function loadSpareParts() {
    try {
      const { data } = await api.get('/spare-parts');
      state.spareParts = data.parts || [];
    } catch { state.spareParts = []; }
  }

  async function loadNotifications() {
    try {
      const { data } = await api.get('/notifications');
      state.notifications = data.notifications || [];
      state.unreadNotifications = state.notifications.filter(n => !n.is_read).length;
      updateMessagesBadge();
    } catch { state.notifications = []; state.unreadNotifications = 0; }
  }

  async function loadUnreadMessages() {
    try {
      const { data } = await api.get('/messages/unread-count');
      state.unreadMessages = data.count || 0;
      updateMessagesBadge();
    } catch { }
  }

  async function loadStats() {
    try {
      const { data } = await api.get('/stats');
      state.stats = data || {};
    } catch { state.stats = {}; }
  }

  // ============ POLLING ============

  let pollTimer = null;
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      await loadUnreadMessages();
      await loadNotifications();
      if (state.route === 'messages' && state.activeChatUserId) {
        await renderChatMessages();
      }
    }, 5000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function updateMessagesBadge() {
    $$('.messages-badge').forEach(el => {
      if (state.unreadMessages > 0) {
        el.textContent = state.unreadMessages;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
    $$('.notifications-badge').forEach(el => {
      if (state.unreadNotifications > 0) {
        el.textContent = state.unreadNotifications;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  }

  // ============ ROUTER / RENDER ============

  function render() {
    const root = $('#root');
    if (state.route === 'login') {
      root.innerHTML = renderLogin();
      bindLogin();
      return;
    }
    if (state.route === 'register') {
      root.innerHTML = renderRegister();
      bindRegister();
      return;
    }
    root.innerHTML = renderShell();
    renderPage();
    bindShell();
    updateMessagesBadge();
  }

  // ============ LOGIN / REGISTER ============

  function renderLogin() {
    return `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="card p-8 w-full max-w-md fade-in">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-24 h-24 rounded-2xl logo-wrap mb-4">
            <img src="/static/logo.svg" class="w-16 h-16" alt="logo">
          </div>
          <h1 class="text-3xl font-bold text-white mb-2">ورشة شويخ</h1>
          <p class="text-gray-400">نظام إدارة تصليح المحركات</p>
        </div>
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">اسم المستخدم</label>
            <input type="text" id="loginUsername" class="w-full px-4 py-3 rounded-lg" placeholder="أدخل اسم المستخدم" required>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">كلمة المرور</label>
            <input type="password" id="loginPassword" class="w-full px-4 py-3 rounded-lg" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn-primary w-full py-3 rounded-lg font-semibold">
            <i class="fas fa-sign-in-alt ml-2"></i> تسجيل الدخول
          </button>
        </form>
        <div class="mt-6 text-center text-sm text-gray-400">
          لا تملك حساباً؟
          <a href="#" id="goRegister" class="text-blue-400 font-semibold hover:underline">إنشاء حساب زبون</a>
        </div>
      </div>
    </div>`;
  }
  function bindLogin() {
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      await login($('#loginUsername').value.trim(), $('#loginPassword').value);
    });
    $('#goRegister').addEventListener('click', e => {
      e.preventDefault();
      state.route = 'register'; render();
    });
  }

  function renderRegister() {
    return `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="card p-8 w-full max-w-md fade-in">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-24 h-24 rounded-2xl logo-wrap mb-4">
            <img src="/static/logo.svg" class="w-16 h-16" alt="logo">
          </div>
          <h1 class="text-2xl font-bold text-white mb-2">إنشاء حساب زبون</h1>
          <p class="text-gray-400">سجّل الآن لمتابعة محركاتك</p>
        </div>
        <form id="registerForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">الاسم الكامل *</label>
            <input type="text" id="regFullName" class="w-full px-4 py-3 rounded-lg" required>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">رقم الهاتف *</label>
            <input type="tel" id="regPhone" class="w-full px-4 py-3 rounded-lg" placeholder="0660XXXXXX" required>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">اسم المستخدم *</label>
            <input type="text" id="regUsername" class="w-full px-4 py-3 rounded-lg" required>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">كلمة المرور *</label>
            <input type="password" id="regPassword" class="w-full px-4 py-3 rounded-lg" minlength="4" required>
          </div>
          <button type="submit" class="btn-success w-full py-3 rounded-lg font-semibold">
            <i class="fas fa-user-plus ml-2"></i> إنشاء الحساب
          </button>
        </form>
        <div class="mt-6 text-center text-sm text-gray-400">
          تملك حساباً؟
          <a href="#" id="goLogin" class="text-blue-400 font-semibold hover:underline">تسجيل الدخول</a>
        </div>
      </div>
    </div>`;
  }
  function bindRegister() {
    $('#registerForm').addEventListener('submit', async e => {
      e.preventDefault();
      await register({
        full_name: $('#regFullName').value.trim(),
        phone: $('#regPhone').value.trim(),
        username: $('#regUsername').value.trim(),
        password: $('#regPassword').value
      });
    });
    $('#goLogin').addEventListener('click', e => {
      e.preventDefault(); state.route = 'login'; render();
    });
  }

  // ============ SHELL (Sidebar + Main) ============

  function menuItems() {
    const role = state.user.role;
    const base = [
      { id: 'dashboard', icon: 'fa-chart-line', label: 'لوحة التحكم' },
    ];
    if (role === 'customer') {
      base.push(
        { id: 'my-engines', icon: 'fa-cogs', label: 'محركاتي' },
        { id: 'messages', icon: 'fa-comments', label: 'الرسائل', badge: 'messages' },
        { id: 'my-debts', icon: 'fa-money-bill-wave', label: 'الديون المستحقة' },
        { id: 'notifications', icon: 'fa-bell', label: 'الإشعارات', badge: 'notifications' },
      );
    } else {
      base.push(
        { id: 'add-engine', icon: 'fa-plus-circle', label: 'إضافة محرك' },
        { id: 'engines', icon: 'fa-cogs', label: 'المحركات' },
        { id: 'customers', icon: 'fa-users', label: 'الزبائن' },
        { id: 'parts', icon: 'fa-boxes-stacked', label: 'قطع الغيار' },
        { id: 'debts', icon: 'fa-money-bill-wave', label: 'الديون المستحقة' },
        { id: 'messages', icon: 'fa-comments', label: 'الرسائل', badge: 'messages' },
        { id: 'notifications', icon: 'fa-bell', label: 'الإشعارات', badge: 'notifications' },
        { id: 'reports', icon: 'fa-file-chart-column', label: 'التقارير' },
      );
      if (role === 'admin') {
        base.push(
          { id: 'users', icon: 'fa-user-shield', label: 'إدارة المستخدمين' },
          { id: 'backup', icon: 'fa-database', label: 'النسخ الاحتياطي' },
        );
      }
    }
    return base;
  }

  function renderShell() {
    const items = menuItems();
    const navHtml = items.map(it => `
      <a href="#" class="nav-item ${state.route === it.id ? 'active' : ''} flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 relative" data-route="${it.id}">
        <i class="fas ${it.icon} w-5"></i>
        <span class="font-medium flex-1">${it.label}</span>
        ${it.badge === 'messages' ? `<span class="messages-badge hidden bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">0</span>` : ''}
        ${it.badge === 'notifications' ? `<span class="notifications-badge hidden bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">0</span>` : ''}
      </a>`).join('');

    const roleBadge = {
      admin: '<span class="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">مدير</span>',
      technician: '<span class="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">فني</span>',
      customer: '<span class="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">زبون</span>'
    }[state.user.role];

    return `
    <div class="min-h-screen flex">
      <div id="sidebarBackdrop" class="sidebar-backdrop hidden md:hidden"></div>
      <aside id="sidebar" class="sidebar w-72 min-h-screen flex-shrink-0">
        <div class="p-6">
          <div class="flex items-center gap-3 mb-8">
            <div class="w-12 h-12 rounded-xl logo-wrap flex items-center justify-center">
              <img src="/static/logo.svg" class="w-10 h-10" alt="">
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">ورشة شويخ</h2>
              <p class="text-xs text-gray-400">نظام الإدارة</p>
            </div>
          </div>
          <div class="mb-6 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <div class="text-xs text-gray-400 mb-1">مرحباً</div>
            <div class="flex items-center justify-between gap-2">
              <div class="font-semibold text-white truncate">${escapeHtml(state.user.full_name)}</div>
              ${roleBadge}
            </div>
          </div>
          <nav class="space-y-1">${navHtml}</nav>
          <button id="logoutBtn" class="w-full mt-8 px-4 py-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition">
            <i class="fas fa-sign-out-alt ml-2"></i> تسجيل الخروج
          </button>
        </div>
      </aside>
      <main class="flex-1 overflow-auto min-w-0">
        <div class="md:hidden glass-effect p-4 flex items-center justify-between sticky top-0 z-40">
          <button id="toggleSidebar" class="text-white text-xl"><i class="fas fa-bars"></i></button>
          <h1 class="text-base font-bold">ورشة شويخ</h1>
          <div class="flex items-center gap-4">
            <button id="mobileNotifications" class="relative text-white text-xl">
              <i class="fas fa-bell"></i>
              <span class="notifications-badge hidden absolute -top-2 -left-2 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">0</span>
            </button>
            <button id="mobileMessages" class="relative text-white text-xl">
              <i class="fas fa-comments"></i>
              <span class="messages-badge hidden absolute -top-2 -left-2 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">0</span>
            </button>
          </div>
        </div>
        <div id="pageContent" class="p-4 md:p-6 fade-in"></div>
      </main>
    </div>`;
  }

  function bindShell() {
    $$('[data-route]').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      state.route = el.dataset.route;
      state.activeChatUserId = null;
      render();
      if (window.innerWidth < 768) closeSidebar();
    }));
    $('#logoutBtn').addEventListener('click', logout);
    $('#toggleSidebar')?.addEventListener('click', openSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#mobileMessages')?.addEventListener('click', () => { state.route = 'messages'; render(); });
    $('#mobileNotifications')?.addEventListener('click', () => { state.route = 'notifications'; render(); });
  }
  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.remove('hidden'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.add('hidden'); }

  // ============ PAGES ROUTER ============

  async function renderPage() {
    const el = $('#pageContent');
    const r = state.route;
    const role = state.user.role;

    if (r === 'dashboard') {
      if (role === 'customer') renderCustomerDashboard(el);
      else await renderStaffDashboard(el);
    } else if (r === 'my-engines') renderMyEngines(el);
    else if (r === 'my-debts') renderMyDebts(el);
    else if (r === 'notifications') renderNotifications(el);
    else if (r === 'add-engine') renderAddEngine(el);
    else if (r === 'engines') renderEngines(el);
    else if (r === 'customers') renderCustomers(el);
    else if (r === 'parts') await renderParts(el);
    else if (r === 'debts') renderDebts(el);
    else if (r === 'messages') await renderMessages(el);
    else if (r === 'reports') await renderReports(el);
    else if (r === 'users') await renderUsersAdmin(el);
    else if (r === 'backup') renderBackup(el);
    else el.innerHTML = '<div class="text-center text-gray-400 p-12">الصفحة غير موجودة</div>';
  }

  // ============ STAFF DASHBOARD ============

  async function renderStaffDashboard(el) {
    await Promise.all([loadStats(), loadEngines()]);
    const s = state.stats;
    const recent = state.engines.slice(0, 5);
    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-2">لوحة التحكم</h1>
      <p class="text-gray-400">نظرة عامة على حركة الورشة</p>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${statCard('إجمالي المحركات', s.total_engines || 0, 'fa-cogs', 'text-blue-400')}
      ${statCard('قيد التصليح', (s.in_progress || 0) + (s.unrepaired || 0), 'fa-wrench', 'text-yellow-400')}
      ${statCard('جاهزة للتسليم', s.ready || 0, 'fa-check-circle', 'text-green-400')}
      ${statCard('إجمالي الديون', formatDZD(s.total_debt || 0), 'fa-money-bill-wave', 'text-red-400')}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      ${statCard('عدد الزبائن', s.customers || 0, 'fa-users', 'text-cyan-400')}
      ${statCard('تم التسليم', s.delivered || 0, 'fa-truck', 'text-purple-400')}
    </div>
    <div class="card p-6">
      <h2 class="text-xl font-bold text-white mb-4">آخر المحركات</h2>
      <div class="space-y-3">
        ${recent.length === 0 ? '<div class="text-center text-gray-500 py-8">لا توجد محركات بعد</div>' :
        recent.map(e => engineRow(e)).join('')}
      </div>
    </div>`;
    bindEngineRowActions(el);
  }

  function statCard(label, value, icon, color) {
    return `<div class="stat-card card p-5">
      <div class="flex items-center justify-between mb-2">
        <span class="text-gray-400 text-sm">${label}</span>
        <i class="fas ${icon} ${color}"></i>
      </div>
      <div class="text-2xl md:text-3xl font-bold text-white">${value}</div>
    </div>`;
  }

  function engineRow(e) {
    const isStaff = state.user && state.user.role !== 'customer';
    const statusIcons = {
      unrepaired: 'fa-clock',
      in_progress: 'fa-wrench',
      ready: 'fa-check-circle',
      delivered: 'fa-truck'
    };
    const badgeIcon = statusIcons[e.status] || 'fa-circle';
    const showStartRepair = isStaff && e.status === 'unrepaired';
    const showMarkReady = isStaff && e.status === 'in_progress';
    const nameLine = isStaff ? (e.customer_name || '-') : e.engine_name;
    const entryDate = e.entry_date ? dayjs(e.entry_date).format('YYYY/MM/DD') : '-';
    const faultShort = (e.fault || '').split('\n')[0].slice(0, 40) || '—';

    return `<div class="card engine-card p-4 md:p-5" data-eid="${e.id}">
      <!-- Header: name + status badge -->
      <div class="flex items-start justify-between gap-2 mb-3">
        <div class="font-bold text-white text-lg truncate">${escapeHtml(nameLine)}</div>
        <span class="status-badge ${statusClass(e.status)} flex-shrink-0">
          <i class="fas ${badgeIcon}"></i>
          ${statusLabel(e.status)}
        </span>
      </div>

      <!-- Details rows -->
      <div class="space-y-1.5 text-sm text-right mb-4">
        <div class="flex items-center justify-end gap-2 text-gray-300">
          <span class="truncate">${escapeHtml(e.engine_type)}${isStaff ? '' : (e.engine_name && isStaff === false ? '' : '')}</span>
          <i class="fas fa-cog text-blue-400"></i>
        </div>
        ${e.power ? `<div class="flex items-center justify-end gap-2 text-gray-300">
          <span>القوة: ${escapeHtml(e.power)}</span>
          <i class="fas fa-bolt text-yellow-400"></i>
        </div>` : ''}
        ${faultShort && faultShort !== '—' ? `<div class="flex items-center justify-end gap-2 text-gray-300">
          <span class="truncate">${escapeHtml(faultShort)}</span>
          <i class="fas fa-triangle-exclamation text-orange-400"></i>
        </div>` : ''}
        <div class="flex items-center justify-end gap-2 text-gray-400 text-xs">
          <span>${entryDate}</span>
          <i class="fas fa-calendar-days"></i>
        </div>
      </div>

      <!-- Action buttons grid -->
      <div class="grid grid-cols-2 gap-2">
        ${showStartRepair ? `<button class="engine-action bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" data-action="start" data-eid="${e.id}">
          <i class="fas fa-wrench"></i><span>بدء التصليح</span>
        </button>` : ''}
        <button class="engine-action bg-blue-600 hover:bg-blue-500 text-white px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" data-action="view" data-eid="${e.id}">
          <i class="fas fa-eye"></i><span>التفاصيل</span>
        </button>
        <button class="engine-action bg-purple-600 hover:bg-purple-500 text-white px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" data-action="chat" data-cid="${e.customer_id || ''}">
          <i class="fas fa-comment"></i><span>مراسلة</span>
        </button>
        ${showMarkReady ? `<button class="engine-action bg-green-600 hover:bg-green-500 text-white px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" data-action="ready" data-eid="${e.id}">
          <i class="fas fa-check"></i><span>تم التصليح</span>
        </button>` : ''}
        ${isStaff && e.status === 'ready' ? `<button class="engine-action bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" data-action="deliver" data-eid="${e.id}">
          <i class="fas fa-truck"></i><span>تسليم</span>
        </button>` : ''}
      </div>
    </div>`;
  }

  async function changeEngineStatus(id, status, successMsg) {
    try {
      await api.put('/engines/' + id, { status });
      toast(successMsg || 'تم التحديث', 'success');
      await loadEngines();
      renderPage();
    } catch { toast('فشل التحديث', 'error'); }
  }

  function bindEngineRowActions(el) {
    el.querySelectorAll('.engine-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const eid = Number(btn.dataset.eid);
        if (action === 'view') openEngineModal(eid);
        else if (action === 'start') await changeEngineStatus(eid, 'in_progress', 'بدأ التصليح');
        else if (action === 'ready') await changeEngineStatus(eid, 'ready', 'تم التصليح');
        else if (action === 'deliver') await changeEngineStatus(eid, 'delivered', 'تم تسليم المحرك');
        else if (action === 'chat') {
          const cid = Number(btn.dataset.cid);
          if (state.user.role === 'customer') {
            // Customer: open chat with first admin/technician
            state.route = 'messages';
            state.activeChatUserId = null;
            render();
          } else if (cid) {
            state.route = 'messages';
            state.activeChatUserId = cid;
            render();
          }
        }
      });
    });
    // Also allow click on card body to open details (not on buttons)
    el.querySelectorAll('[data-eid]').forEach(card => {
      if (!card.classList.contains('engine-action')) {
        card.addEventListener('click', e => {
          if (e.target.closest('.engine-action')) return;
          openEngineModal(Number(card.dataset.eid));
        });
        card.style.cursor = 'pointer';
      }
    });
  }

  // ============ CUSTOMER DASHBOARD ============

  function renderCustomerDashboard(el) {
    const readyEngines = state.engines.filter(e => e.status === 'ready');
    const inRepair = state.engines.filter(e => ['unrepaired', 'in_progress'].includes(e.status));
    const history = state.engines.filter(e => e.status === 'delivered');
    const debts = state.engines.filter(e => (e.final_price || 0) > (e.paid_amount || 0));
    const totalDebt = debts.reduce((s, e) => s + ((e.final_price || 0) - (e.paid_amount || 0)), 0);

    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-2">لوحة الزبون</h1>
      <p class="text-gray-400">متابعة محركاتك في الورشة</p>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      ${statCard('جاهز للاستلام', readyEngines.length, 'fa-check-circle', 'text-green-400')}
      ${statCard('قيد التصليح', inRepair.length, 'fa-wrench', 'text-yellow-400')}
      ${statCard('المحركات السابقة', history.length, 'fa-history', 'text-blue-400')}
      ${statCard('إجمالي الديون', formatDZD(totalDebt), 'fa-money-bill-wave', 'text-red-400')}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      ${customerSection('جاهزة للاستلام', 'fa-check-double', 'text-green-400', 'customer-section-green', readyEngines, 'لا توجد محركات جاهزة')}
      ${customerSection('قيد التصليح', 'fa-wrench', 'text-red-400', 'customer-section-red', inRepair, 'لا توجد محركات قيد التصليح')}
      ${customerSection('سجل المحركات', 'fa-history', 'text-blue-400', 'customer-section-history', history, 'لا يوجد سجل بعد')}
      ${customerSection('الديون المستحقة', 'fa-money-bill-wave', 'text-yellow-400', 'customer-section-debt', debts, 'لا توجد ديون مستحقة', true)}
    </div>`;
    bindEngineRowActions(el);
  }

  function customerSection(title, icon, iconColor, bgCls, engines, emptyMsg, debt = false) {
    return `<div class="${bgCls} card p-5">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-lg bg-slate-800/70 flex items-center justify-center">
          <i class="fas ${icon} ${iconColor}"></i>
        </div>
        <h2 class="text-lg font-bold text-white">${title}</h2>
        <span class="ml-auto text-sm text-gray-400">${engines.length}</span>
      </div>
      <div class="space-y-2">
        ${engines.length === 0 ? `<div class="text-center text-gray-500 py-6 text-sm">${emptyMsg}</div>` :
        engines.map(e => `<div class="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50 cursor-pointer hover:border-blue-500/30" data-engine-view="${e.id}">
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="font-semibold text-white text-sm truncate">${escapeHtml(e.engine_name)}</div>
            <span class="status-badge ${statusClass(e.status)} text-xs">${statusLabel(e.status)}</span>
          </div>
          <div class="text-xs text-gray-400">${escapeHtml(e.engine_type)}</div>
          ${debt ? `<div class="text-xs text-yellow-400 mt-1 font-semibold">المستحق: ${formatDZD((e.final_price || 0) - (e.paid_amount || 0))}</div>` :
            (e.estimated_price ? `<div class="text-xs text-gray-500 mt-1">التكلفة المتوقعة: ${formatDZD(e.estimated_price)}</div>` : '')}
        </div>`).join('')}
      </div>
    </div>`;
  }

  // ============ ENGINE DETAIL MODAL ============

  async function openEngineModal(id) {
    try {
      const { data } = await api.get('/engines/' + id);
      const e = data.engine;
      const images = e.fault_images ? JSON.parse(e.fault_images) : [];
      const partsList = e.parts_list ? JSON.parse(e.parts_list) : [];
      const canEdit = state.user.role !== 'customer';
      const debtLeft = (e.final_price || 0) - (e.paid_amount || 0);

      const content = `
      <div class="flex items-start justify-between mb-4">
        <div>
          <h2 class="text-xl font-bold text-white mb-1">${escapeHtml(e.engine_name)}</h2>
          <div class="text-sm text-gray-400">${escapeHtml(e.engine_type)}</div>
        </div>
        <button class="text-gray-400 hover:text-white" onclick="this.closest('.fixed').remove()"><i class="fas fa-times text-xl"></i></button>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div class="p-3 rounded-lg bg-slate-800/50">
          <div class="text-xs text-gray-400">الزبون</div>
          <div class="font-semibold text-white">${escapeHtml(e.customer_name || '-')}</div>
        </div>
        <div class="p-3 rounded-lg bg-slate-800/50">
          <div class="text-xs text-gray-400">الهاتف</div>
          <div class="font-semibold text-white">${escapeHtml(e.customer_phone || '-')}</div>
        </div>
        <div class="p-3 rounded-lg bg-slate-800/50">
          <div class="text-xs text-gray-400">الحالة</div>
          <div class="mt-1"><span class="status-badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></div>
        </div>
        <div class="p-3 rounded-lg bg-slate-800/50">
          <div class="text-xs text-gray-400">القوة</div>
          <div class="font-semibold text-white">${escapeHtml(e.power || '-')}</div>
        </div>
        <div class="p-3 rounded-lg bg-slate-800/50">
          <div class="text-xs text-gray-400">تاريخ الدخول</div>
          <div class="font-semibold text-white">${formatDate(e.entry_date)}</div>
        </div>
        <div class="p-3 rounded-lg bg-slate-800/50">
          <div class="text-xs text-gray-400">تاريخ التسليم المتوقع</div>
          <div class="font-semibold text-white">${formatDate(e.expected_delivery)}</div>
        </div>
        <div class="p-3 rounded-lg bg-slate-800/50">
          <div class="text-xs text-gray-400">السعر التقديري</div>
          <div class="font-semibold text-white">${formatDZD(e.estimated_price)}</div>
        </div>
        <div class="p-3 rounded-lg bg-slate-800/50">
          <div class="text-xs text-gray-400">السعر النهائي</div>
          <div class="font-semibold text-white">${formatDZD(e.final_price)}</div>
        </div>
      </div>

      ${debtLeft > 0 ? `<div class="p-3 mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between">
        <div><i class="fas fa-exclamation-triangle text-yellow-400 ml-2"></i>
        <span class="text-yellow-300">المستحق: ${formatDZD(debtLeft)}</span></div>
        <span class="text-xs text-gray-400">مدفوع: ${formatDZD(e.paid_amount)}</span>
      </div>` : ''}

      ${e.fault ? `<div class="mb-4">
        <div class="text-sm text-gray-400 mb-1">العطل</div>
        <div class="p-3 rounded-lg bg-slate-800/50 text-white text-sm whitespace-pre-wrap">${escapeHtml(e.fault)}</div>
      </div>` : ''}

      ${images.length > 0 ? `<div class="mb-4">
        <div class="text-sm text-gray-400 mb-2">صور العطل</div>
        <div class="grid grid-cols-3 gap-2">
          ${images.map(img => `<img src="${img}" class="w-full h-24 object-cover rounded-lg cursor-pointer" onclick="window.open(this.src, '_blank')">`).join('')}
        </div>
      </div>` : ''}

      ${partsList.length > 0 ? `<div class="mb-4">
        <div class="text-sm text-gray-400 mb-2">قطع الغيار الناقصة</div>
        <ul class="space-y-1">
          ${partsList.map(p => `<li class="flex items-center gap-2 text-sm">
            <i class="fas ${p.available ? 'fa-check text-green-400' : 'fa-times text-red-400'}"></i>
            <span>${escapeHtml(p.name)}</span>
            ${!p.available ? '<span class="text-xs text-red-400">(غير متوفرة)</span>' : ''}
          </li>`).join('')}
        </ul>
      </div>` : ''}

      ${e.missing_parts ? `<div class="mb-4">
        <div class="text-sm text-gray-400 mb-1">القطع الناقصة</div>
        <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">${escapeHtml(e.missing_parts)}</div>
      </div>` : ''}

      ${canEdit ? `<div class="border-t border-slate-700 pt-4 space-y-3">
        <h3 class="text-white font-bold">إدارة المحرك</h3>
        <div class="grid grid-cols-2 gap-2">
          <select id="engineStatusSel" class="px-3 py-2 rounded-lg">
            <option value="unrepaired"${e.status === 'unrepaired' ? ' selected' : ''}>غير مصلح</option>
            <option value="in_progress"${e.status === 'in_progress' ? ' selected' : ''}>قيد التصليح</option>
            <option value="ready"${e.status === 'ready' ? ' selected' : ''}>جاهز للتسليم</option>
            <option value="delivered"${e.status === 'delivered' ? ' selected' : ''}>تم التسليم</option>
          </select>
          <input type="number" id="engineFinalPrice" class="px-3 py-2 rounded-lg" placeholder="السعر النهائي" value="${e.final_price || ''}">
        </div>
        <button id="saveEngineBtn" class="btn-primary w-full py-2 rounded-lg font-semibold"><i class="fas fa-save ml-2"></i>حفظ التعديلات</button>
        <div class="grid grid-cols-2 gap-2">
          <input type="number" id="payAmount" class="px-3 py-2 rounded-lg" placeholder="مبلغ الدفع">
          <select id="paymentStatusSel" class="px-3 py-2 rounded-lg">
            <option value="">حالة التسليم</option>
            <option value="cash">تسليم كاش</option>
            <option value="debt">التسليم دين</option>
            <option value="paid">مسدد بالكامل</option>
          </select>
        </div>
        <button id="payBtn" class="btn-success w-full py-2 rounded-lg font-semibold"><i class="fas fa-money-bill ml-2"></i>تسجيل الدفع</button>
        ${state.user.role === 'admin' ? `<button id="deleteEngineBtn" class="btn-danger w-full py-2 rounded-lg font-semibold"><i class="fas fa-trash ml-2"></i>حذف المحرك</button>` : ''}
      </div>` : `
      <button class="btn-primary w-full py-2 rounded-lg font-semibold" id="contactStaffBtn">
        <i class="fas fa-comments ml-2"></i>مراسلة الورشة بخصوص هذا المحرك
      </button>
      `}
      `;

      const mod = modal(content);

      mod.querySelector('#saveEngineBtn')?.addEventListener('click', async () => {
        const status = mod.querySelector('#engineStatusSel').value;
        const finalPrice = Number(mod.querySelector('#engineFinalPrice').value) || 0;
        try {
          await api.put('/engines/' + id, { status, final_price: finalPrice });
          toast('تم الحفظ', 'success');
          await loadEngines();
          mod.remove();
          renderPage();
        } catch (err) { toast('فشل الحفظ', 'error'); }
      });
      mod.querySelector('#payBtn')?.addEventListener('click', async () => {
        const amount = Number(mod.querySelector('#payAmount').value);
        const ps = mod.querySelector('#paymentStatusSel').value;
        if (!amount || amount <= 0) return toast('أدخل مبلغ صحيح', 'error');
        try {
          await api.post('/debts/pay', { engine_id: id, amount, payment_status: ps || undefined });
          toast('تم تسجيل الدفعة', 'success');
          await loadEngines();
          mod.remove();
          renderPage();
        } catch { toast('فشل تسجيل الدفع', 'error'); }
      });
      mod.querySelector('#deleteEngineBtn')?.addEventListener('click', async () => {
        if (!confirm('هل تريد حذف هذا المحرك؟')) return;
        try {
          await api.delete('/engines/' + id);
          toast('تم الحذف', 'success');
          await loadEngines();
          mod.remove();
          renderPage();
        } catch { toast('فشل الحذف', 'error'); }
      });
      mod.querySelector('#contactStaffBtn')?.addEventListener('click', async () => {
        mod.remove();
        state.route = 'messages';
        render();
      });

    } catch (err) {
      toast('تعذّر فتح التفاصيل', 'error');
    }
  }

  // ============ ADD ENGINE (staff) ============

  function renderAddEngine(el) {
    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-2">إضافة محرك</h1>
      <p class="text-gray-400">تسجيل محرك جديد في الورشة</p>
    </div>
    <div class="card p-6 max-w-3xl">
      <form id="addEngineForm" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="relative">
            <label class="block text-sm font-medium text-gray-300 mb-2">الزبون *</label>
            <input type="text" id="customerSearch" class="w-full px-4 py-3 rounded-lg" placeholder="ابحث بالاسم أو الهاتف..." autocomplete="off">
            <input type="hidden" id="customerIdHidden" required>
            <div id="customerDropdown" class="dropdown-content hidden absolute z-20 left-0 right-0 mt-1 glass-effect rounded-lg max-h-60 overflow-auto"></div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">هاتف الزبون</label>
            <input type="tel" id="customerPhoneDisplay" class="w-full px-4 py-3 rounded-lg bg-slate-800/50" readonly placeholder="يُعبّأ تلقائياً">
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">اسم المحرك *</label>
            <input type="text" id="engineName" class="w-full px-4 py-3 rounded-lg" required placeholder="مثال: محرك المزرعة">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">نوع المحرك *</label>
            <select id="engineType" class="w-full px-4 py-3 rounded-lg" required>
              <option value="">-- اختر --</option>
              <option>ديزل - ميتسوبيشي</option>
              <option>ديزل - ياماها</option>
              <option>ديزل - كوبوتا</option>
              <option>ديزل - بيرسو</option>
              <option>بنزين - هوندا</option>
              <option>بنزين - روبين</option>
              <option>بنزين - كرافت</option>
              <option>كهربائي</option>
              <option>أخرى</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">قوة المحرك</label>
            <input type="text" id="enginePower" class="w-full px-4 py-3 rounded-lg" placeholder="مثال: 50 حصان">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">السعر التقديري (دج)</label>
            <input type="number" id="enginePrice" class="w-full px-4 py-3 rounded-lg" placeholder="0" min="0">
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">تاريخ الدخول</label>
            <input type="date" id="engineEntry" class="w-full px-4 py-3 rounded-lg" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">تاريخ التسليم المتوقع</label>
            <input type="date" id="engineExpected" class="w-full px-4 py-3 rounded-lg">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">نوع العطل</label>
          <textarea id="engineFault" rows="3" class="w-full px-4 py-3 rounded-lg" placeholder="اشرح العطل بالتفصيل..."></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">صور العطل</label>
          <input type="file" id="faultImages" accept="image/*" multiple class="w-full px-4 py-3 rounded-lg">
          <div id="imagePreview" class="mt-2 grid grid-cols-4 gap-2"></div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">قطع الغيار الناقصة</label>
          <div id="partsContainer" class="space-y-2"></div>
          <button type="button" id="addPartBtn" class="mt-2 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-sm hover:bg-blue-500/30">
            <i class="fas fa-plus ml-1"></i> إضافة قطعة
          </button>
        </div>
        <button type="submit" class="btn-success w-full py-3 rounded-lg font-semibold">
          <i class="fas fa-save ml-2"></i> حفظ المحرك
        </button>
      </form>
    </div>

    <div class="card p-6 max-w-3xl mt-6">
      <h2 class="text-lg font-bold text-white mb-4"><i class="fas fa-user-plus ml-2"></i>زبون جديد سريع</h2>
      <form id="quickCustomerForm" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input type="text" id="qcName" class="px-4 py-3 rounded-lg" placeholder="الاسم الكامل *" required>
        <input type="tel" id="qcPhone" class="px-4 py-3 rounded-lg" placeholder="رقم الهاتف *" required>
        <input type="text" id="qcUsername" class="px-4 py-3 rounded-lg" placeholder="اسم المستخدم *" required>
        <input type="password" id="qcPassword" class="px-4 py-3 rounded-lg" placeholder="كلمة المرور *" required minlength="4">
        <button type="submit" class="btn-primary md:col-span-2 py-3 rounded-lg font-semibold">
          <i class="fas fa-user-plus ml-2"></i> إضافة زبون
        </button>
      </form>
    </div>`;

    bindAddEngine(el);
  }

  function bindAddEngine(el) {
    const input = el.querySelector('#customerSearch');
    const drop = el.querySelector('#customerDropdown');
    const hidden = el.querySelector('#customerIdHidden');
    const phoneD = el.querySelector('#customerPhoneDisplay');

    function refreshDrop() {
      const q = input.value.trim().toLowerCase();
      const filtered = state.customers.filter(c =>
        c.full_name.toLowerCase().includes(q) || (c.phone || '').includes(q));
      if (filtered.length === 0) { drop.classList.add('hidden'); return; }
      drop.innerHTML = filtered.slice(0, 20).map(c => `
        <div class="dropdown-item px-4 py-2 cursor-pointer" data-cid="${c.id}" data-name="${escapeHtml(c.full_name)}" data-phone="${escapeHtml(c.phone || '')}">
          <div class="font-semibold">${escapeHtml(c.full_name)}</div>
          <div class="text-xs text-gray-400">${escapeHtml(c.phone || '')}</div>
        </div>`).join('');
      drop.classList.remove('hidden');
    }
    input.addEventListener('input', refreshDrop);
    input.addEventListener('focus', refreshDrop);
    document.addEventListener('click', e => {
      if (!drop.contains(e.target) && e.target !== input) drop.classList.add('hidden');
    });
    drop.addEventListener('click', e => {
      const item = e.target.closest('[data-cid]');
      if (!item) return;
      hidden.value = item.dataset.cid;
      input.value = item.dataset.name;
      phoneD.value = item.dataset.phone;
      drop.classList.add('hidden');
    });

    // Image preview
    const imgInput = el.querySelector('#faultImages');
    const imgPrev = el.querySelector('#imagePreview');
    const imageDataUrls = [];
    imgInput.addEventListener('change', async () => {
      imageDataUrls.length = 0;
      imgPrev.innerHTML = '';
      for (const f of imgInput.files) {
        const url = await fileToDataUrl(f);
        imageDataUrls.push(url);
        imgPrev.appendChild(h(`<img src="${url}" class="w-full h-20 object-cover rounded-lg">`));
      }
    });

    // Parts
    const partsC = el.querySelector('#partsContainer');
    el.querySelector('#addPartBtn').addEventListener('click', () => {
      partsC.appendChild(h(`<div class="flex items-center gap-2 p-2 rounded-lg bg-slate-800/40">
        <input type="text" class="part-name flex-1 px-3 py-2 rounded-lg" placeholder="اسم القطعة">
        <label class="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" class="part-unavailable w-4 h-4"> غير متوفرة
        </label>
        <button type="button" class="remove-part text-red-400 hover:text-red-300"><i class="fas fa-times"></i></button>
      </div>`));
      partsC.lastElementChild.querySelector('.remove-part').addEventListener('click', e => e.target.closest('div').remove());
    });

    el.querySelector('#addEngineForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (!hidden.value) return toast('يرجى اختيار الزبون', 'error');
      const parts_list = Array.from(partsC.children).map(row => ({
        name: row.querySelector('.part-name').value.trim(),
        available: !row.querySelector('.part-unavailable').checked
      })).filter(p => p.name);

      try {
        await api.post('/engines', {
          customer_id: Number(hidden.value),
          engine_name: el.querySelector('#engineName').value.trim(),
          engine_type: el.querySelector('#engineType').value,
          power: el.querySelector('#enginePower').value.trim(),
          estimated_price: Number(el.querySelector('#enginePrice').value) || 0,
          entry_date: el.querySelector('#engineEntry').value,
          expected_delivery: el.querySelector('#engineExpected').value,
          fault: el.querySelector('#engineFault').value.trim(),
          fault_images: imageDataUrls,
          parts_list
        });
        toast('تم إضافة المحرك', 'success');
        await loadEngines();
        state.route = 'engines';
        render();
      } catch (err) {
        toast(err.response?.data?.error || 'فشل إضافة المحرك', 'error');
      }
    });

    el.querySelector('#quickCustomerForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api.post('/users', {
          username: el.querySelector('#qcUsername').value.trim(),
          password: el.querySelector('#qcPassword').value,
          role: 'customer',
          full_name: el.querySelector('#qcName').value.trim(),
          phone: el.querySelector('#qcPhone').value.trim()
        });
        toast('تم إضافة الزبون', 'success');
        await loadCustomers();
        el.querySelector('#quickCustomerForm').reset();
      } catch (err) { toast(err.response?.data?.error || 'فشل', 'error'); }
    });
  }

  // ============ ENGINES LIST (staff) ============

  function renderEngines(el) {
    const filter = state.filters.engineStatus;
    const filtered = filter === 'all' ? state.engines : state.engines.filter(e => e.status === filter);
    el.innerHTML = `
    <div class="mb-6 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">المحركات</h1>
        <p class="text-gray-400 text-sm">${filtered.length} محرك</p>
      </div>
      <div class="flex flex-wrap gap-2">
        ${['all', 'unrepaired', 'in_progress', 'ready', 'delivered'].map(s => `
          <button class="px-3 py-1.5 text-sm rounded-lg ${filter === s ? 'btn-primary' : 'bg-slate-700/50 text-gray-300 hover:bg-slate-700'}" data-filter="${s}">
            ${s === 'all' ? 'الكل' : statusLabel(s)}
          </button>`).join('')}
      </div>
    </div>
    <div class="space-y-3">
      ${filtered.length === 0 ? '<div class="text-center text-gray-500 py-12">لا توجد محركات</div>' :
        filtered.map(e => engineRow(e)).join('')}
    </div>`;
    el.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
      state.filters.engineStatus = b.dataset.filter;
      renderEngines(el);
    }));
    bindEngineRowActions(el);
  }

  function renderMyEngines(el) {
    const filter = state.filters.engineStatus;
    const filtered = filter === 'all' ? state.engines : state.engines.filter(e => e.status === filter);
    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">محركاتي</h1>
      <p class="text-gray-400 text-sm">جميع محركاتك في الورشة</p>
    </div>
    <div class="flex flex-wrap gap-2 mb-4">
      ${['all', 'unrepaired', 'in_progress', 'ready', 'delivered'].map(s => `
        <button class="px-3 py-1.5 text-sm rounded-lg ${filter === s ? 'btn-primary' : 'bg-slate-700/50 text-gray-300'}" data-filter="${s}">
          ${s === 'all' ? 'الكل' : statusLabel(s)}
        </button>`).join('')}
    </div>
    <div class="space-y-3">
      ${filtered.length === 0 ? '<div class="text-center text-gray-500 py-12">لا توجد محركات</div>' :
        filtered.map(e => engineRow(e)).join('')}
    </div>`;
    el.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
      state.filters.engineStatus = b.dataset.filter;
      renderMyEngines(el);
    }));
    bindEngineRowActions(el);
  }

  // ============ CUSTOMERS (staff) ============

  function renderCustomers(el) {
    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">الزبائن</h1>
      <p class="text-gray-400 text-sm">${state.customers.length} زبون</p>
    </div>
    <input type="text" id="customerFilter" class="w-full px-4 py-3 rounded-lg mb-4" placeholder="ابحث عن زبون...">
    <div id="customersGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;
    const grid = el.querySelector('#customersGrid');
    function renderList(q = '') {
      const ql = q.toLowerCase();
      const list = state.customers.filter(c => c.full_name.toLowerCase().includes(ql) || (c.phone || '').includes(ql));
      grid.innerHTML = list.length === 0 ? '<div class="col-span-full text-center text-gray-500 py-12">لا يوجد زبائن</div>' :
        list.map(c => {
          const cEngines = state.engines.filter(e => e.customer_id === c.id);
          const debt = cEngines.reduce((s, e) => s + ((e.final_price || 0) - (e.paid_amount || 0)), 0);
          return `<div class="card p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center"><i class="fas fa-user text-blue-400"></i></div>
              <div class="min-w-0">
                <div class="font-bold text-white truncate">${escapeHtml(c.full_name)}</div>
                <div class="text-xs text-gray-400">${escapeHtml(c.phone || '-')}</div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs mb-3">
              <div class="p-2 rounded bg-slate-800/50"><div class="text-gray-400">المحركات</div><div class="text-white font-bold">${cEngines.length}</div></div>
              <div class="p-2 rounded bg-slate-800/50"><div class="text-gray-400">الدين</div><div class="text-yellow-400 font-bold">${formatDZD(debt)}</div></div>
            </div>
            <div class="flex gap-2">
              <button class="flex-1 px-2 py-1.5 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" data-msg="${c.id}"><i class="fas fa-comment ml-1"></i>مراسلة</button>
              ${state.user.role === 'admin' ? `<button class="flex-1 px-2 py-1.5 text-xs rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" data-edit-user="${c.id}"><i class="fas fa-edit ml-1"></i>تعديل</button>` : ''}
              ${debt > 0 ? `<button class="flex-1 px-2 py-1.5 text-xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30" data-remind="${c.id}"><i class="fas fa-bell ml-1"></i>تذكير</button>` : ''}
            </div>
          </div>`;
        }).join('');
      grid.querySelectorAll('[data-msg]').forEach(b => b.addEventListener('click', () => {
        state.route = 'messages'; state.activeChatUserId = Number(b.dataset.msg); render();
      }));
      grid.querySelectorAll('[data-remind]').forEach(b => b.addEventListener('click', async () => {
        try {
          const { data } = await api.post('/debts/remind', { customer_id: Number(b.dataset.remind) });
          toast(`تم إرسال تذكير بالدين (${formatDZD(data.amount)})`, 'success');
        } catch { toast('فشل الإرسال', 'error'); }
      }));
      grid.querySelectorAll('[data-edit-user]').forEach(b => b.addEventListener('click', () => openUserEditModal(Number(b.dataset.editUser))));
    }
    renderList();
    el.querySelector('#customerFilter').addEventListener('input', e => renderList(e.target.value));
  }

  // ============ USERS ADMIN ============

  async function renderUsersAdmin(el) {
    await loadTechnicians();
    el.innerHTML = `
    <div class="mb-6 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">إدارة المستخدمين</h1>
        <p class="text-gray-400 text-sm">إضافة وتعديل الفنيين والزبائن</p>
      </div>
      <button id="newUserBtn" class="btn-primary px-4 py-2 rounded-lg font-semibold"><i class="fas fa-user-plus ml-2"></i>مستخدم جديد</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="card p-5">
        <h2 class="text-lg font-bold text-white mb-4"><i class="fas fa-wrench ml-2 text-blue-400"></i>الفنيون (${state.technicians.length})</h2>
        <div id="techList" class="space-y-2"></div>
      </div>
      <div class="card p-5">
        <h2 class="text-lg font-bold text-white mb-4"><i class="fas fa-users ml-2 text-green-400"></i>الزبائن (${state.customers.length})</h2>
        <div id="custList" class="space-y-2 max-h-96 overflow-auto"></div>
      </div>
    </div>`;

    function row(u) {
      return `<div class="flex items-center justify-between gap-2 p-3 rounded-lg bg-slate-800/40 border border-slate-700">
        <div class="min-w-0">
          <div class="font-semibold text-white truncate">${escapeHtml(u.full_name)}</div>
          <div class="text-xs text-gray-400">${escapeHtml(u.username)} • ${escapeHtml(u.phone || '-')}</div>
        </div>
        <div class="flex gap-1">
          <button class="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400" data-edit-user="${u.id}"><i class="fas fa-edit"></i></button>
          <button class="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400" data-del-user="${u.id}"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }
    el.querySelector('#techList').innerHTML = state.technicians.map(row).join('') || '<div class="text-center text-gray-500 py-4">لا يوجد فنيون</div>';
    el.querySelector('#custList').innerHTML = state.customers.map(row).join('') || '<div class="text-center text-gray-500 py-4">لا يوجد زبائن</div>';

    el.querySelectorAll('[data-edit-user]').forEach(b => b.addEventListener('click', () => openUserEditModal(Number(b.dataset.editUser))));
    el.querySelectorAll('[data-del-user]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('هل تريد حذف هذا المستخدم؟')) return;
      try {
        await api.delete('/users/' + b.dataset.delUser);
        toast('تم الحذف', 'success');
        await Promise.all([loadCustomers(), loadTechnicians()]);
        renderUsersAdmin(el);
      } catch { toast('فشل', 'error'); }
    }));
    el.querySelector('#newUserBtn').addEventListener('click', () => openUserCreateModal());
  }

  function openUserCreateModal() {
    const content = `
    <h2 class="text-xl font-bold text-white mb-4">إضافة مستخدم جديد</h2>
    <form id="newUserForm" class="space-y-3">
      <div>
        <label class="text-sm text-gray-300">الدور *</label>
        <select id="nuRole" class="w-full px-3 py-2 rounded-lg mt-1">
          <option value="customer">زبون</option>
          <option value="technician">فني</option>
          <option value="admin">مدير</option>
        </select>
      </div>
      <input type="text" id="nuFullName" class="w-full px-3 py-2 rounded-lg" placeholder="الاسم الكامل *" required>
      <input type="tel" id="nuPhone" class="w-full px-3 py-2 rounded-lg" placeholder="رقم الهاتف">
      <input type="text" id="nuUsername" class="w-full px-3 py-2 rounded-lg" placeholder="اسم المستخدم *" required>
      <input type="password" id="nuPassword" class="w-full px-3 py-2 rounded-lg" placeholder="كلمة المرور *" required minlength="4">
      <div class="flex gap-2">
        <button type="button" class="flex-1 py-2 rounded-lg bg-slate-700 text-white" onclick="this.closest('.fixed').remove()">إلغاء</button>
        <button type="submit" class="flex-1 btn-primary py-2 rounded-lg">حفظ</button>
      </div>
    </form>`;
    const m = modal(content);
    m.querySelector('#newUserForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api.post('/users', {
          role: m.querySelector('#nuRole').value,
          full_name: m.querySelector('#nuFullName').value.trim(),
          phone: m.querySelector('#nuPhone').value.trim(),
          username: m.querySelector('#nuUsername').value.trim(),
          password: m.querySelector('#nuPassword').value
        });
        toast('تم الإضافة', 'success');
        await Promise.all([loadCustomers(), loadTechnicians()]);
        m.remove();
        renderPage();
      } catch (err) { toast(err.response?.data?.error || 'فشل', 'error'); }
    });
  }

  function openUserEditModal(id) {
    const u = [...state.customers, ...state.technicians].find(x => x.id === id);
    if (!u) return;
    const content = `
    <h2 class="text-xl font-bold text-white mb-4">تعديل: ${escapeHtml(u.full_name)}</h2>
    <form id="editUserForm" class="space-y-3">
      <input type="text" id="euFullName" class="w-full px-3 py-2 rounded-lg" value="${escapeHtml(u.full_name)}" required>
      <input type="tel" id="euPhone" class="w-full px-3 py-2 rounded-lg" value="${escapeHtml(u.phone || '')}" placeholder="الهاتف">
      <input type="password" id="euPassword" class="w-full px-3 py-2 rounded-lg" placeholder="كلمة مرور جديدة (اتركها فارغة للإبقاء)" minlength="4">
      <div>
        <label class="text-sm text-gray-300">تذكيرات الديون</label>
        <select id="euNotify" class="w-full px-3 py-2 rounded-lg mt-1">
          <option value="weekly"${u.notify_frequency === 'weekly' ? ' selected' : ''}>أسبوعية</option>
          <option value="monthly"${u.notify_frequency === 'monthly' ? ' selected' : ''}>شهرية</option>
          <option value="off"${u.notify_frequency === 'off' ? ' selected' : ''}>إيقاف</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button type="button" class="flex-1 py-2 rounded-lg bg-slate-700 text-white" onclick="this.closest('.fixed').remove()">إلغاء</button>
        <button type="submit" class="flex-1 btn-primary py-2 rounded-lg">حفظ</button>
      </div>
    </form>`;
    const m = modal(content);
    m.querySelector('#editUserForm').addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        full_name: m.querySelector('#euFullName').value.trim(),
        phone: m.querySelector('#euPhone').value.trim(),
        notify_frequency: m.querySelector('#euNotify').value
      };
      const pw = m.querySelector('#euPassword').value;
      if (pw) payload.password = pw;
      try {
        await api.put('/users/' + id, payload);
        toast('تم الحفظ', 'success');
        await Promise.all([loadCustomers(), loadTechnicians()]);
        m.remove();
        renderPage();
      } catch { toast('فشل', 'error'); }
    });
  }

  // ============ SPARE PARTS ============

  async function renderParts(el) {
    await loadSpareParts();
    el.innerHTML = `
    <div class="mb-6 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">قطع الغيار</h1>
        <p class="text-gray-400 text-sm">${state.spareParts.length} قطعة</p>
      </div>
      <button id="newPartBtn" class="btn-primary px-4 py-2 rounded-lg font-semibold"><i class="fas fa-plus ml-2"></i>إضافة قطعة</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      ${state.spareParts.length === 0 ? '<div class="col-span-full text-center text-gray-500 py-12">لا توجد قطع</div>' :
        state.spareParts.map(p => `<div class="card p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="font-bold text-white truncate">${escapeHtml(p.name)}</div>
              <div class="text-xs text-gray-400">${p.notes ? escapeHtml(p.notes) : ''}</div>
            </div>
            <div class="flex gap-1">
              <button class="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400" data-edit-part="${p.id}"><i class="fas fa-edit"></i></button>
              ${state.user.role === 'admin' ? `<button class="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400" data-del-part="${p.id}"><i class="fas fa-trash"></i></button>` : ''}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-3 text-sm">
            <div class="p-2 rounded bg-slate-800/50"><div class="text-xs text-gray-400">الكمية</div><div class="text-white font-bold ${p.quantity === 0 ? 'text-red-400' : ''}">${p.quantity}</div></div>
            <div class="p-2 rounded bg-slate-800/50"><div class="text-xs text-gray-400">السعر</div><div class="text-green-400 font-bold">${formatDZD(p.price)}</div></div>
          </div>
        </div>`).join('')}
    </div>`;
    el.querySelector('#newPartBtn').addEventListener('click', () => openPartModal());
    el.querySelectorAll('[data-edit-part]').forEach(b => b.addEventListener('click', () => {
      const p = state.spareParts.find(x => x.id === Number(b.dataset.editPart));
      openPartModal(p);
    }));
    el.querySelectorAll('[data-del-part]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('حذف القطعة؟')) return;
      try { await api.delete('/spare-parts/' + b.dataset.delPart); toast('تم الحذف', 'success'); await renderParts(el); } catch { toast('فشل', 'error'); }
    }));
  }

  function openPartModal(part) {
    const isEdit = !!part;
    const content = `
    <h2 class="text-xl font-bold text-white mb-4">${isEdit ? 'تعديل القطعة' : 'قطعة جديدة'}</h2>
    <form id="partForm" class="space-y-3">
      <input type="text" id="pName" class="w-full px-3 py-2 rounded-lg" placeholder="اسم القطعة *" required value="${isEdit ? escapeHtml(part.name) : ''}">
      <div class="grid grid-cols-2 gap-2">
        <input type="number" id="pQty" class="w-full px-3 py-2 rounded-lg" placeholder="الكمية" value="${isEdit ? part.quantity : 0}">
        <input type="number" id="pPrice" class="w-full px-3 py-2 rounded-lg" placeholder="السعر (دج)" value="${isEdit ? part.price : 0}">
      </div>
      <textarea id="pNotes" class="w-full px-3 py-2 rounded-lg" rows="2" placeholder="ملاحظات">${isEdit ? escapeHtml(part.notes || '') : ''}</textarea>
      <div class="flex gap-2">
        <button type="button" class="flex-1 py-2 rounded-lg bg-slate-700 text-white" onclick="this.closest('.fixed').remove()">إلغاء</button>
        <button type="submit" class="flex-1 btn-primary py-2 rounded-lg">حفظ</button>
      </div>
    </form>`;
    const m = modal(content);
    m.querySelector('#partForm').addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        name: m.querySelector('#pName').value.trim(),
        quantity: Number(m.querySelector('#pQty').value) || 0,
        price: Number(m.querySelector('#pPrice').value) || 0,
        notes: m.querySelector('#pNotes').value.trim()
      };
      try {
        if (isEdit) await api.put('/spare-parts/' + part.id, payload);
        else await api.post('/spare-parts', payload);
        toast('تم الحفظ', 'success');
        m.remove();
        renderPage();
      } catch { toast('فشل', 'error'); }
    });
  }

  // ============ DEBTS ============

  function renderDebts(el) {
    // Group debts by customer
    const perCustomer = {};
    state.engines.filter(e => (e.final_price || 0) > (e.paid_amount || 0)).forEach(e => {
      const key = e.customer_id;
      if (!perCustomer[key]) perCustomer[key] = { customer_name: e.customer_name, customer_phone: e.customer_phone, customer_id: e.customer_id, engines: [], total: 0 };
      perCustomer[key].engines.push(e);
      perCustomer[key].total += (e.final_price || 0) - (e.paid_amount || 0);
    });
    const list = Object.values(perCustomer).sort((a, b) => b.total - a.total);

    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">إدارة الديون</h1>
      <p class="text-gray-400 text-sm">الزبائن الذين لديهم ديون مستحقة</p>
    </div>
    <div class="mb-4 card p-5 stat-card">
      <div class="text-gray-400 text-sm">إجمالي الديون</div>
      <div class="text-3xl font-bold text-yellow-400">${formatDZD(list.reduce((s, x) => s + x.total, 0))}</div>
    </div>
    <div class="space-y-3">
      ${list.length === 0 ? '<div class="text-center text-gray-500 py-12">لا توجد ديون</div>' :
        list.map(c => `<div class="card p-5">
          <div class="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <div class="font-bold text-white text-lg">${escapeHtml(c.customer_name)}</div>
              <div class="text-xs text-gray-400">${escapeHtml(c.customer_phone || '-')}</div>
            </div>
            <div class="text-left">
              <div class="text-xs text-gray-400">المستحق</div>
              <div class="text-xl font-bold text-red-400">${formatDZD(c.total)}</div>
            </div>
          </div>
          <div class="space-y-2 mb-3">
            ${c.engines.map(e => `<div class="flex items-center justify-between p-2 rounded bg-slate-800/50 text-sm">
              <div class="truncate">${escapeHtml(e.engine_name)}</div>
              <div class="text-yellow-400 font-semibold">${formatDZD((e.final_price || 0) - (e.paid_amount || 0))}</div>
            </div>`).join('')}
          </div>
          <div class="flex gap-2">
            <button class="flex-1 px-3 py-2 text-sm rounded-lg bg-red-500/20 text-red-400" data-remind="${c.customer_id}"><i class="fas fa-bell ml-1"></i>إرسال تذكير</button>
            <button class="flex-1 px-3 py-2 text-sm rounded-lg bg-blue-500/20 text-blue-400" data-msg="${c.customer_id}"><i class="fas fa-comments ml-1"></i>مراسلة</button>
          </div>
        </div>`).join('')}
    </div>`;
    el.querySelectorAll('[data-remind]').forEach(b => b.addEventListener('click', async () => {
      try {
        const { data } = await api.post('/debts/remind', { customer_id: Number(b.dataset.remind) });
        toast(`تم إرسال التذكير (${formatDZD(data.amount)})`, 'success');
      } catch { toast('فشل', 'error'); }
    }));
    el.querySelectorAll('[data-msg]').forEach(b => b.addEventListener('click', () => {
      state.route = 'messages'; state.activeChatUserId = Number(b.dataset.msg); render();
    }));
  }

  function renderMyDebts(el) {
    const debts = state.engines.filter(e => (e.final_price || 0) > (e.paid_amount || 0));
    const total = debts.reduce((s, e) => s + ((e.final_price || 0) - (e.paid_amount || 0)), 0);
    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">الديون المستحقة</h1>
      <p class="text-gray-400 text-sm">قائمة الديون والمدفوعات</p>
    </div>
    <div class="card p-6 stat-card mb-4">
      <div class="text-gray-400 text-sm">إجمالي المستحق</div>
      <div class="text-3xl font-bold text-yellow-400">${formatDZD(total)}</div>
    </div>
    <div class="space-y-3">
      ${debts.length === 0 ? '<div class="text-center text-gray-500 py-12 card p-6">لا توجد ديون مستحقة ✓</div>' :
        debts.map(e => {
          const remaining = (e.final_price || 0) - (e.paid_amount || 0);
          const pct = e.final_price ? Math.min(100, ((e.paid_amount || 0) / e.final_price) * 100) : 0;
          const label = { cash: 'تسليم كاش', debt: 'التسليم دين', paid: 'مسدد', unpaid: 'غير مسدد' }[e.payment_status] || e.payment_status;
          const color = { cash: 'text-green-400', debt: 'text-yellow-400', paid: 'text-green-400', unpaid: 'text-gray-400' }[e.payment_status] || 'text-gray-400';
          return `<div class="card p-4">
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="font-bold text-white">${escapeHtml(e.engine_name)}</div>
              <span class="text-xs ${color} font-semibold">${label}</span>
            </div>
            <div class="text-xs text-gray-400 mb-2">${escapeHtml(e.engine_type)}</div>
            <div class="w-full bg-slate-800 rounded-full h-2 mb-2"><div class="bg-green-500 h-2 rounded-full" style="width:${pct}%"></div></div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">مدفوع: <span class="text-green-400">${formatDZD(e.paid_amount)}</span></span>
              <span class="text-yellow-400 font-bold">متبقّ: ${formatDZD(remaining)}</span>
            </div>
          </div>`;
        }).join('')}
    </div>`;
  }

  // ============ NOTIFICATIONS ============

  function renderNotifications(el) {
    el.innerHTML = `
    <div class="mb-6 flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">الإشعارات</h1>
        <p class="text-gray-400 text-sm">${state.notifications.length} إشعار</p>
      </div>
      <button id="markAllRead" class="px-3 py-1.5 text-sm rounded-lg bg-blue-500/20 text-blue-400">
        <i class="fas fa-check-double ml-1"></i>تحديد الكل كمقروء
      </button>
    </div>
    <div class="space-y-2">
      ${state.notifications.length === 0 ? '<div class="text-center text-gray-500 py-12 card p-6">لا توجد إشعارات</div>' :
        state.notifications.map(n => {
          const icon = { status: 'fa-circle-info text-blue-400', debt: 'fa-money-bill-wave text-yellow-400', message: 'fa-comment text-green-400', info: 'fa-bell text-gray-400' }[n.type] || 'fa-bell text-gray-400';
          return `<div class="card p-4 ${!n.is_read ? 'border-blue-500/30' : ''}">
            <div class="flex items-start gap-3">
              <i class="fas ${icon} mt-1"></i>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-white">${escapeHtml(n.title)}</div>
                <div class="text-sm text-gray-400 mt-1">${escapeHtml(n.body || '')}</div>
                <div class="text-xs text-gray-500 mt-1">${formatDateTime(n.created_at)}</div>
              </div>
              ${!n.is_read ? '<span class="w-2 h-2 bg-blue-500 rounded-full mt-2"></span>' : ''}
            </div>
          </div>`;
        }).join('')}
    </div>`;
    el.querySelector('#markAllRead').addEventListener('click', async () => {
      try { await api.post('/notifications/read'); await loadNotifications(); renderNotifications(el); } catch { }
    });
  }

  // ============ MESSAGES ============

  async function renderMessages(el) {
    const { data } = await api.get('/messages/conversations');
    state.conversations = data.conversations || [];
    if (!state.activeChatUserId && state.conversations.length) {
      state.activeChatUserId = state.conversations[0].id;
    }
    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">الرسائل</h1>
      <p class="text-gray-400 text-sm">تواصل فوري مع ${state.user.role === 'customer' ? 'الورشة' : 'الزبائن'}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4" style="min-height: 500px;">
      <div class="card p-3 md:col-span-1 max-h-[70vh] overflow-auto">
        <input type="text" id="convFilter" class="w-full px-3 py-2 rounded-lg mb-3 text-sm" placeholder="بحث...">
        <div id="convList" class="space-y-1"></div>
      </div>
      <div class="card p-4 md:col-span-2 flex flex-col" style="max-height: 70vh;">
        <div id="chatHeader" class="border-b border-slate-700 pb-3 mb-3"></div>
        <div id="chatMessages" class="flex-1 overflow-auto space-y-2 mb-3 pr-1"></div>
        <div id="chatInputArea" class="hidden border-t border-slate-700 pt-3">
          <div id="chatImagePreview" class="hidden mb-2"></div>
          <div class="flex gap-2 items-end">
            <label class="px-3 py-2 rounded-lg bg-slate-700 text-gray-300 cursor-pointer hover:bg-slate-600">
              <i class="fas fa-image"></i>
              <input type="file" id="chatImage" accept="image/*" class="hidden">
            </label>
            <textarea id="chatInput" rows="1" class="flex-1 px-3 py-2 rounded-lg resize-none" placeholder="اكتب رسالتك..."></textarea>
            <button id="chatSend" class="btn-primary px-4 py-2 rounded-lg"><i class="fas fa-paper-plane"></i></button>
          </div>
        </div>
      </div>
    </div>`;
    renderConversationList();
    el.querySelector('#convFilter').addEventListener('input', renderConversationList);
    if (state.activeChatUserId) await renderChatMessages();
  }

  function renderConversationList() {
    const list = $('#convList');
    if (!list) return;
    const q = ($('#convFilter')?.value || '').toLowerCase();
    const filtered = state.conversations.filter(c => c.full_name.toLowerCase().includes(q));
    list.innerHTML = filtered.length === 0 ? '<div class="text-gray-500 text-center py-4 text-sm">لا يوجد</div>' :
      filtered.map(c => `<div class="conversation-item ${state.activeChatUserId === c.id ? 'active' : ''}" data-conv="${c.id}">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <i class="fas ${c.role === 'admin' ? 'fa-user-shield text-red-400' : c.role === 'technician' ? 'fa-wrench text-blue-400' : 'fa-user text-green-400'}"></i>
            </div>
            <div class="min-w-0">
              <div class="font-semibold text-white text-sm truncate">${escapeHtml(c.full_name)}</div>
              <div class="text-xs text-gray-400 truncate">${escapeHtml((c.last_message || 'لا توجد رسائل').slice(0, 40))}</div>
            </div>
          </div>
          ${c.unread > 0 ? `<span class="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center">${c.unread}</span>` : ''}
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-conv]').forEach(el => el.addEventListener('click', async () => {
      state.activeChatUserId = Number(el.dataset.conv);
      renderConversationList();
      await renderChatMessages();
      await loadUnreadMessages();
    }));
  }

  let currentChatImage = null;
  async function renderChatMessages() {
    const hdr = $('#chatHeader');
    const msgs = $('#chatMessages');
    const area = $('#chatInputArea');
    if (!msgs) return;
    if (!state.activeChatUserId) {
      hdr.innerHTML = '<div class="text-gray-400 text-center py-4">اختر محادثة</div>';
      msgs.innerHTML = '';
      area.classList.add('hidden');
      return;
    }
    const peer = state.conversations.find(c => c.id === state.activeChatUserId);
    hdr.innerHTML = peer ? `<div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
        <i class="fas ${peer.role === 'admin' ? 'fa-user-shield text-red-400' : peer.role === 'technician' ? 'fa-wrench text-blue-400' : 'fa-user text-green-400'}"></i>
      </div>
      <div><div class="font-bold text-white">${escapeHtml(peer.full_name)}</div>
      <div class="text-xs text-gray-400">${peer.role === 'admin' ? 'مدير' : peer.role === 'technician' ? 'فني' : 'زبون'}</div></div>
    </div>` : '';
    try {
      const { data } = await api.get('/messages?with=' + state.activeChatUserId);
      const messages = data.messages || [];
      msgs.innerHTML = messages.length === 0 ? '<div class="text-gray-500 text-center py-8 text-sm">ابدأ محادثة</div>' :
        messages.map(m => {
          const mine = m.from_user_id === state.user.id;
          return `<div class="flex ${mine ? 'justify-start' : 'justify-end'}">
            <div class="msg-bubble ${mine ? 'msg-mine' : 'msg-theirs'}">
              ${m.image_url ? `<img src="${m.image_url}" class="max-w-full rounded-lg mb-1 cursor-pointer" onclick="window.open(this.src,'_blank')">` : ''}
              ${m.body ? `<div>${escapeHtml(m.body)}</div>` : ''}
              <div class="text-xs opacity-60 mt-1 text-left">${formatDateTime(m.created_at)}</div>
            </div>
          </div>`;
        }).join('');
      msgs.scrollTop = msgs.scrollHeight;
      area.classList.remove('hidden');

      const input = $('#chatInput');
      const sendBtn = $('#chatSend');
      const imgInput = $('#chatImage');
      const imgPrev = $('#chatImagePreview');
      currentChatImage = null;

      imgInput.onchange = async () => {
        if (imgInput.files[0]) {
          currentChatImage = await fileToDataUrl(imgInput.files[0]);
          imgPrev.innerHTML = `<div class="relative inline-block"><img src="${currentChatImage}" class="h-20 rounded-lg"><button class="absolute -top-2 -left-2 bg-red-500 text-white w-6 h-6 rounded-full text-xs" id="removeChatImg"><i class="fas fa-times"></i></button></div>`;
          imgPrev.classList.remove('hidden');
          $('#removeChatImg').onclick = () => { currentChatImage = null; imgPrev.classList.add('hidden'); imgInput.value = ''; };
        }
      };

      async function send() {
        const body = input.value.trim();
        if (!body && !currentChatImage) return;
        try {
          await api.post('/messages', { to_user_id: state.activeChatUserId, body, image_url: currentChatImage });
          input.value = '';
          currentChatImage = null;
          imgPrev.classList.add('hidden');
          imgInput.value = '';
          await renderChatMessages();
        } catch { toast('فشل الإرسال', 'error'); }
      }
      sendBtn.onclick = send;
      input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    } catch { msgs.innerHTML = '<div class="text-red-400 text-center py-8">فشل التحميل</div>'; }
  }

  // ============ REPORTS ============

  async function renderReports(el) {
    try {
      const { data } = await api.get('/reports');
      el.innerHTML = `
      <div class="mb-6">
        <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">التقارير</h1>
        <p class="text-gray-400 text-sm">إحصائيات دورية عن حالة الإصلاحات</p>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="card p-5">
          <h2 class="text-lg font-bold text-white mb-4">حالة المحركات</h2>
          <canvas id="statusChart"></canvas>
        </div>
        <div class="card p-5">
          <h2 class="text-lg font-bold text-white mb-4">نشاط الأشهر الأخيرة</h2>
          <canvas id="monthlyChart"></canvas>
        </div>
      </div>
      <div class="card p-5">
        <h2 class="text-lg font-bold text-white mb-4">أحدث المحركات</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-gray-400 text-right border-b border-slate-700">
              <th class="py-2 px-2">المحرك</th><th class="py-2 px-2">الزبون</th><th class="py-2 px-2">الحالة</th><th class="py-2 px-2">السعر</th><th class="py-2 px-2">التاريخ</th>
            </tr></thead>
            <tbody>
            ${data.recent.map(r => `<tr class="border-b border-slate-800">
              <td class="py-2 px-2 text-white">${escapeHtml(r.engine_name)}</td>
              <td class="py-2 px-2">${escapeHtml(r.customer_name)}</td>
              <td class="py-2 px-2"><span class="status-badge ${statusClass(r.status)}">${statusLabel(r.status)}</span></td>
              <td class="py-2 px-2 text-green-400">${formatDZD(r.final_price || r.estimated_price)}</td>
              <td class="py-2 px-2 text-gray-400">${formatDate(r.created_at)}</td>
            </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
      // Status chart
      const s = state.stats;
      new Chart($('#statusChart'), {
        type: 'doughnut',
        data: {
          labels: ['غير مصلح', 'قيد التصليح', 'جاهز', 'تم التسليم'],
          datasets: [{
            data: [s.unrepaired || 0, s.in_progress || 0, s.ready || 0, s.delivered || 0],
            backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6']
          }]
        },
        options: { plugins: { legend: { labels: { color: '#cbd5e1' } } } }
      });
      // Monthly chart
      const months = data.monthly.slice().reverse();
      new Chart($('#monthlyChart'), {
        type: 'bar',
        data: {
          labels: months.map(m => m.month),
          datasets: [
            { label: 'محركات', data: months.map(m => m.engines), backgroundColor: '#3b82f6' },
            { label: 'تم التسليم', data: months.map(m => m.delivered), backgroundColor: '#10b981' }
          ]
        },
        options: {
          plugins: { legend: { labels: { color: '#cbd5e1' } } },
          scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } }
        }
      });
    } catch {
      el.innerHTML = '<div class="text-red-400 text-center py-12">فشل تحميل التقارير</div>';
    }
  }

  // ============ BACKUP ============

  function renderBackup(el) {
    el.innerHTML = `
    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-white mb-1">النسخ الاحتياطي</h1>
      <p class="text-gray-400 text-sm">حماية وتشفير بيانات قاعدة البيانات</p>
    </div>
    <div class="card p-6 max-w-2xl">
      <div class="flex items-start gap-4 mb-4">
        <div class="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <i class="fas fa-database text-2xl text-blue-400"></i>
        </div>
        <div>
          <h2 class="text-lg font-bold text-white">تنزيل نسخة احتياطية</h2>
          <p class="text-sm text-gray-400 mt-1">ملف JSON يحتوي كل بيانات النظام: الزبائن، المحركات، الرسائل، الإشعارات، قطع الغيار.</p>
        </div>
      </div>
      <div class="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-300 mb-4">
        <i class="fas fa-shield-alt ml-2"></i> جميع كلمات المرور محفوظة مجزّأة بـ SGA-256 والاتصالات مشفرة HTTPS.
      </div>
      <button id="downloadBackup" class="btn-primary w-full py-3 rounded-lg font-semibold">
        <i class="fas fa-download ml-2"></i> تنزيل نسخة احتياطية
      </button>
    </div>`;
    el.querySelector('#downloadBackup').addEventListener('click', async () => {
      try {
        const res = await fetch('/api/backup', { credentials: 'include' });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast('تم تنزيل النسخة الاحتياطية', 'success');
      } catch { toast('فشل', 'error'); }
    });
  }

  // ============ INIT ============

  document.addEventListener('DOMContentLoaded', checkAuth);
})();
