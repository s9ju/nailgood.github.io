/**
 * PREMIUM BEAUTY APP - JavaScript
 */

// Fallback для loadData
if (typeof loadData !== 'function') {
  window.loadData = async function() {
    return {
      settings: {
        masterName: "Мастер маникюра",
        masterDescription: "",
        masterPhoto: "",
        primaryColor: "#c4a574",
        confirmationText: "Мастер перезвонит вам за сутки до записи",
        botToken: "",
        masterChatId: "",
        channelUsername: ""
      },
      services: [
        { name: "Маникюр базовый", price: 1500, duration: 60 },
        { name: "Маникюр + покрытие", price: 2500, duration: 90 }
      ],
      schedule: [],
      adminPassword: "NailPro2024!"
    };
  };
}

const DEFAULT_ADMIN_PASSWORD = 'NailPro2024!';
const MASTER_PHOTO_CACHE_KEY = 'manik_master_photo_data_url';
const getAdminPasswordKey = () => `manik_admin_password`;
const getAdminPassword = () => localStorage.getItem(getAdminPasswordKey()) || DEFAULT_ADMIN_PASSWORD;
const getStorageKey = () => `manik_bookings`;

const state = {
  settings: null,
  services: [],
  schedule: [],
  selectedService: null,
  selectedDate: null,
  selectedSlot: null,
  currentMonth: new Date(),
  bookings: {},
  initialized: false,
  adminAuthenticated: false,
  isSubscribed: false,
  adminPassword: DEFAULT_ADMIN_PASSWORD
};

const tg = window.Telegram.WebApp;

// Инициализация Telegram
function initTelegram() {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#000000');
  tg.setBackgroundColor('#000000');
  tg.onEvent('backButtonClicked', handleBackButton);
}

// Haptic feedback
function hapticClick() {
  if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}
function hapticSuccess() {
  if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}
function hapticError() {
  if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
}
function hapticSelection() {
  if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

// Загрузка данных
async function loadAllData() {
  const data = await loadData();

  state.settings = {
    masterName: data.settings?.masterName || 'Мастер маникюра',
    masterDescription: data.settings?.masterDescription || '',
    masterPhoto: data.settings?.masterPhoto || '',
    primaryColor: data.settings?.primaryColor || '#c4a574',
    confirmationText: data.settings?.confirmationText || 'Мастер перезвонит вам за сутки до записи',
    botToken: data.settings?.botToken || '',
    masterChatId: data.settings?.masterChatId || '',
    channelUsername: data.settings?.channelUsername || ''
  };

  // Переопределяем настройками из админ-панели, если они уже сохранялись ранее
  try {
    const savedSettings = localStorage.getItem('manik_admin_settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      state.settings = {
        ...state.settings,
        ...parsed
      };
    }
  } catch (e) {
    console.error('Settings load error:', e);
  }

  const savedServices = localStorage.getItem('manik_admin_services');
  state.services = savedServices ? JSON.parse(savedServices) : 
    (data.services || []).map(s => ({
      name: s.name || '',
      price: s.price || 0,
      duration: s.duration || 60,
      emoji: s.emoji || ''
    })).filter(s => s.name);

  const savedSchedule = localStorage.getItem('manik_admin_schedule');
  state.schedule = savedSchedule ? JSON.parse(savedSchedule) :
    (data.schedule || []).map(s => ({
      date: s.date || '',
      startTime: s.startTime || '',
      endTime: s.endTime || '',
      breakStart: s.breakStart || '',
      breakEnd: s.breakEnd || ''
    })).filter(s => s.date);

  state.adminPassword = data.adminPassword || DEFAULT_ADMIN_PASSWORD;

  if (state.schedule.length > 0 && state.schedule[0].date) {
    const firstDate = new Date(state.schedule[0].date);
    state.currentMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  }

  return data;
}

// Bookings
function loadBookings() {
  try {
    const stored = localStorage.getItem(getStorageKey());
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

function saveBookingsToStorage() {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(state.bookings));
  } catch (e) { console.error('Save error:', e); }
}

function saveBooking(dateKey, time, bookingData) {
  const key = `${dateKey}_${time}`;
  state.bookings[key] = {
    ...bookingData,
    serviceName: state.selectedService.name,
    serviceDuration: state.selectedService.duration,
    timestamp: new Date().toISOString()
  };
  saveBookingsToStorage();
}

function removeBooking(key) {
  if (state.bookings[key]) {
    delete state.bookings[key];
    saveBookingsToStorage();
    renderAdminBookings();
    renderCalendar();
    return true;
  }
  return false;
}

window.removeBooking = removeBooking;

function isTimeSlotBusy(dateKey, time, duration = null) {
  const serviceDuration = duration || (state.selectedService?.duration || 60);
  const [startHour, startMin] = time.split(':').map(Number);
  const startTimeMin = startHour * 60 + startMin;
  const endTimeMin = startTimeMin + serviceDuration;

  for (const [key, booking] of Object.entries(state.bookings)) {
    if (!key.startsWith(dateKey + '_')) continue;
    const bookingTime = key.split('_')[1];
    const [bHour, bMin] = bookingTime.split(':').map(Number);
    const bookingStartMin = bHour * 60 + bMin;
    const bookingEndMin = bookingStartMin + (booking.serviceDuration || 60);
    if (startTimeMin < bookingEndMin && endTimeMin > bookingStartMin) {
      return true;
    }
  }
  return false;
}

// Проверка подписки
async function checkSubscription() {
  const { channelUsername, botToken } = state.settings;
  if (!channelUsername || !botToken) { state.isSubscribed = true; return true; }

  const userId = tg.initDataUnsafe?.user?.id;
  if (!userId) { state.isSubscribed = true; return true; }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelUsername.startsWith('@') ? channelUsername : `@${channelUsername}`,
        user_id: userId
      })
    });

    if (!response.ok) { state.isSubscribed = false; return false; }

    const data = await response.json();
    const status = data.result?.status;
    state.isSubscribed = ['member', 'administrator', 'creator'].includes(status);
    return state.isSubscribed;
  } catch (error) {
    state.isSubscribed = false;
    return false;
  }
}

function showSubscribeScreen() {
  const { channelUsername } = state.settings;
  const channelLink = `https://t.me/${channelUsername}`;
  const channelNameEl = document.getElementById('subscribe-channel-name');
  if (channelNameEl) {
    channelNameEl.textContent = channelUsername.startsWith('@') ? channelUsername : `@${channelUsername}`;
  }
  showScreen('subscribe-screen');
  tg.openTelegramLink(channelLink);
}

async function checkSubscribeAndContinue() {
  showLoading();
  const subscribed = await checkSubscription();
  if (subscribed) {
    hapticSuccess();
    showScreen('form-screen');
  } else {
    hapticError();
    showSubscribeScreen();
  }
}

// Генерация слотов
function generateTimeSlots(date, schedule) {
  if (!schedule || !schedule.startTime || !schedule.endTime) return [];

  const slots = [];
  const slotStep = 30;
  const dateKey = formatDateKey(date);

  const [startHour, startMin] = schedule.startTime.split(':').map(Number);
  const [endHour, endMin] = schedule.endTime.split(':').map(Number);

  let currentTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  let breakStartMin = 0, breakEndMin = 0;
  if (schedule.breakStart && schedule.breakEnd) {
    const [bh1, bm1] = schedule.breakStart.split(':').map(Number);
    const [bh2, bm2] = schedule.breakEnd.split(':').map(Number);
    breakStartMin = bh1 * 60 + bm1;
    breakEndMin = bh2 * 60 + bm2;
  }

  const serviceDuration = state.selectedService?.duration || 60;

  while (currentTime + serviceDuration <= endTime) {
    const timeString = minutesToTime(currentTime);
    const isDuringBreak = breakStartMin > 0 && currentTime >= breakStartMin && currentTime < breakEndMin;
    const isBusy = isTimeSlotBusy(dateKey, timeString, serviceDuration);

    if (!isDuringBreak && !isBusy) slots.push(timeString);
    currentTime += slotStep;
  }

  return slots;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function isDayBusy(date) {
  const dateKey = formatDateKey(date);
  const daySchedule = getScheduleForDate(dateKey);
  if (!daySchedule || !daySchedule.startTime || !daySchedule.endTime) return true;
  const availableSlots = generateTimeSlots(date, daySchedule);
  return availableSlots.length === 0;
}

function getScheduleForDate(dateKey) {
  return state.schedule.find(s => s.date === dateKey) || null;
}

// Форматирование
function formatDate(date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateKey(date) {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

function isToday(date) {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function formatPrice(price) {
  const numPrice = typeof price === 'string' ? parseInt(price) || 0 : price;
  return `${numPrice.toLocaleString('ru-RU')}₽`;
}

// Темы
function applyThemeByName(themeName) {
  document.documentElement.classList.remove('theme-main', 'theme-pink', 'theme-ocean', 'theme-forest', 'theme-gold');
  document.body.classList.remove('theme-main', 'theme-pink', 'theme-ocean', 'theme-forest', 'theme-gold');

  if (themeName && themeName !== 'main') {
    const themeClass = 'theme-' + themeName;
    document.documentElement.classList.add(themeClass);
    document.body.classList.add(themeClass);
  }
  localStorage.setItem('manik_theme', themeName);
}

// Отправка в бот (уведомление мастеру + кнопка "Заблокировать")
async function sendBookingToBot(bookingData) {
  const userId = tg.initDataUnsafe?.user?.id;
  const botToken = state.settings?.botToken;
  const masterChatId = state.settings?.masterChatId;
  
  console.log('🔍 ОТПРАВКА...');
  console.log('📦 User ID:', userId || 'НЕ ОПРЕДЕЛЁН (inline-кнопка/внешний запуск)');
  console.log('📦 Token:', botToken ? '✅' : '❌');
  console.log('📦 Master ChatID:', masterChatId || 'нет');
  
  if (!botToken || !masterChatId) {
    alert('❌ Ошибка конфигурации бота. Проверьте botToken и masterChatId в data.json');
    return false;
  }

  // Красивое сообщение мастеру
  const masterMessage = `✅ *НОВАЯ ЗАПИСЬ!*\n\n` +
    `👤 *Клиент:* ${bookingData.name}\n` +
    `📱 *Телефон:* ${bookingData.phone}\n` +
    `💅 *Услуга:* ${bookingData.serviceName}\n` +
    `📅 *Дата:* ${bookingData.date}\n` +
    `⏰ *Время:* ${bookingData.time}\n` +
    `💰 *Цена:* ${bookingData.price}₽` +
    (userId ? `\n\n_ID: \`${userId}\` (для бана)_` : '');

  // Инлайн‑кнопка "Заблокировать" с callback_data, которую обрабатывает бот
  const replyMarkup = userId ? {
    inline_keyboard: [[
      { text: '🚫 Заблокировать', callback_data: `ban_${userId}` }
    ]]
  } : undefined;

  try {
    const body = {
      chat_id: masterChatId,
      text: masterMessage,
      parse_mode: 'Markdown'
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    console.log('✅ Мастер уведомлён (web-app → bot → мастер)');
    return true;
  } catch (e) {
    console.error('❌ ОШИБКА ОТПРАВКИ МАСТЕРУ:', e);
    alert('❌ Ошибка отправки мастеру: ' + e.message);
    return false;
  }
}

// Навигация
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
  updateBackButton();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showLoading() { showScreen('loading-screen'); }

function showError(message) {
  const errorEl = document.getElementById('error-text');
  if (errorEl) errorEl.textContent = message;
  showScreen('error-screen');
}

function updateBackButton() {
  const currentScreen = document.querySelector('.screen.active');
  const shouldShow = currentScreen && 
    !['welcome-screen', 'loading-screen', 'error-screen', 'confirmation-screen'].includes(currentScreen.id);
  if (shouldShow) tg.BackButton.show();
  else tg.BackButton.hide();
}

function handleBackButton() {
  const currentScreen = document.querySelector('.screen.active');
  switch (currentScreen?.id) {
    case 'services-screen': showScreen('welcome-screen'); break;
    case 'calendar-screen': showScreen('services-screen'); break;
    case 'slots-screen': showScreen('calendar-screen'); break;
    case 'form-screen': showScreen('slots-screen'); break;
    case 'confirmation-screen': tg.close(); break;
    case 'admin-screen': closeAdminPanel(); break;
    case 'subscribe-screen': showScreen('form-screen'); break;
  }
}

// Модальное окно
function openPasswordModal() {
  const modal = document.getElementById('password-modal');
  modal.classList.remove('hidden');
  document.getElementById('admin-password').value = '';
  document.getElementById('password-error').textContent = '';
  setTimeout(() => document.getElementById('admin-password').focus(), 100);
}

function closePasswordModal() {
  document.getElementById('password-modal').classList.add('hidden');
}

function checkPassword() {
  const input = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('password-error');
  const currentPassword = getAdminPassword();

  if (input === currentPassword) {
    state.adminAuthenticated = true;
    hapticSuccess();
    closePasswordModal();
    openAdminPanel();
  } else {
    hapticError();
    errorEl.textContent = '❌ Неверный пароль';
    document.getElementById('admin-password').value = '';
    const inputEl = document.getElementById('admin-password');
    inputEl.parentElement.classList.add('shake');
    setTimeout(() => inputEl.parentElement.classList.remove('shake'), 300);
  }
}

function togglePasswordVisibility() {
  const input = document.getElementById('admin-password');
  const btn = document.getElementById('toggle-password-visibility');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// Рендеринг
function renderWelcome() {
  const masterNameEl = document.getElementById('master-name');
  const masterPhotoEl = document.getElementById('master-photo');
  const welcomeTextEl = document.getElementById('welcome-text');

  masterNameEl.textContent = state.settings.masterName;

  // 1. Пробуем взять закэшированную аватарку (data URL) — это надёжно работает в WebView
  const cachedAvatar = localStorage.getItem(MASTER_PHOTO_CACHE_KEY);
  if (cachedAvatar) {
    masterPhotoEl.src = cachedAvatar;
  } else if (state.settings.masterPhoto) {
    // 2. Если кеша нет, используем URL, но всё равно подстрахуемся плейсхолдером
    masterPhotoEl.src = state.settings.masterPhoto;
    masterPhotoEl.onerror = function() {
      this.src = getPlaceholderAvatar(state.settings.masterName);
    };
  } else {
    // 3. Нет ни кеша, ни URL — показываем плейсхолдер
    masterPhotoEl.src = getPlaceholderAvatar(state.settings.masterName);
  }

  welcomeTextEl.textContent = state.settings.masterDescription || 'Топ-мастер с опытом 5 лет. Работаю на премиум материалах';
}

function getPlaceholderAvatar(name) {
  const firstLetter = (name || 'М')[0].toUpperCase();
  const color = state.settings?.primaryColor?.replace('#', '') || 'c4a574';
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#${color};stop-opacity:1" />
        <stop offset="100%" style="stop-color:#a89060;stop-opacity:1" />
      </linearGradient></defs>
      <circle cx="50" cy="50" r="50" fill="url(#grad)"/>
      <text x="50" y="62" text-anchor="middle" fill="white" font-size="42" font-weight="bold">${firstLetter}</text>
    </svg>
  `)}`;
}

// Предзагрузка и кеширование аватарки мастера как data URL,
// чтобы она стабильно отображалась даже в Telegram WebView на телефоне.
function preloadAndCacheAvatar(url) {
  if (!url) {
    localStorage.removeItem(MASTER_PHOTO_CACHE_KEY);
    return;
  }

  try {
    fetch(url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const dataUrl = reader.result;
            if (typeof dataUrl === 'string') {
              localStorage.setItem(MASTER_PHOTO_CACHE_KEY, dataUrl);
              // После обновления кеша сразу перерисуем
              renderWelcome();
            }
          } catch (e) {
            console.error('Avatar cache save error:', e);
          }
        };
        reader.readAsDataURL(blob);
      })
      .catch(err => {
        console.error('Avatar preload error:', err);
      });
  } catch (e) {
    console.error('Avatar preload exception:', e);
  }
}

function renderServices() {
  const container = document.getElementById('services-list');
  if (state.services.length === 0) {
    container.innerHTML = '<p class="no-slots-message">Услуги не найдены</p>';
    return;
  }

  container.innerHTML = state.services.map((service, index) => `
    <div class="service-item" data-index="${index}">
      <div class="service-info">
        <div class="service-emoji">${service.emoji || '💅'}</div>
        <div class="service-details">
          <div class="service-name">${escapeHtml(service.name)}</div>
          <div class="service-meta">${service.duration} мин</div>
        </div>
      </div>
      <div class="service-price">${formatPrice(service.price)}</div>
    </div>
  `).join('');

  container.querySelectorAll('.service-item').forEach(item => {
    item.addEventListener('click', () => {
      hapticClick();
      const index = parseInt(item.dataset.index);
      state.selectedService = state.services[index];
      container.querySelectorAll('.service-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      setTimeout(() => { showScreen('calendar-screen'); renderCalendar(); }, 200);
    });
  });
}

function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();

  const monthName = state.currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  document.getElementById('current-month').textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = (firstDay.getDay() || 7) - 1;
  const totalDays = lastDay.getDate();

  const container = document.getElementById('calendar-days');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = '';
  for (let i = 0; i < startDay; i++) html += '<div class="calendar-day empty"></div>';

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    const isPast = date < today;
    const isBusy = isPast || isDayBusy(date);
    const isSelected = state.selectedDate && formatDateKey(date) === formatDateKey(state.selectedDate);
    const isTodayDate = isToday(date);

    let classes = 'calendar-day';
    if (!isBusy) classes += ' available';
    else classes += ' busy';
    if (isSelected) classes += ' selected';
    if (isTodayDate) classes += ' today';

    html += `<div class="${classes}" data-day="${day}">${day}</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.calendar-day:not(.empty):not(.busy)').forEach(day => {
    day.addEventListener('click', () => {
      hapticClick();
      const dayNum = parseInt(day.dataset.day);
      state.selectedDate = new Date(year, month, dayNum);
      container.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
      day.classList.add('selected');
      setTimeout(() => { showScreen('slots-screen'); renderSlots(); }, 200);
    });
  });
}

function renderSlots() {
  const dateKey = formatDateKey(state.selectedDate);
  const schedule = getScheduleForDate(dateKey);

  document.getElementById('selected-date').textContent = formatDate(state.selectedDate);

  const emoji = state.selectedService.emoji || '💅';
  document.getElementById('selected-service-info').textContent =
    `${emoji} ${state.selectedService.name} • ${state.selectedService.duration} мин • ${formatPrice(state.selectedService.price)}`;

  const slots = schedule ? generateTimeSlots(state.selectedDate, schedule) : [];
  const container = document.getElementById('slots-list');

  if (slots.length === 0) {
    container.innerHTML = '<p class="no-slots-message">Нет свободных слотов</p>';
  } else {
    container.innerHTML = slots.map(slot => `<div class="slot-item" data-slot="${slot}">${slot}</div>`).join('');

    container.querySelectorAll('.slot-item').forEach(item => {
      item.addEventListener('click', () => {
        hapticClick();
        state.selectedSlot = item.dataset.slot;
        container.querySelectorAll('.slot-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        setTimeout(() => { showScreen('form-screen'); renderForm(); }, 200);
      });
    });
  }
}

function renderForm() {
  document.getElementById('summary-service').textContent = state.selectedService.name;
  document.getElementById('summary-date').textContent = formatDate(state.selectedDate);
  document.getElementById('summary-time').textContent = state.selectedSlot;
  document.getElementById('summary-price').textContent = formatPrice(state.selectedService.price);
  document.getElementById('client-name').value = '';
  document.getElementById('client-phone').value = '';
  clearPhoneError();
}

function renderConfirmation() {
  document.getElementById('confirmation-text').textContent = state.settings?.confirmationText || 'Мастер перезвонит вам за сутки до записи';
}

// Валидация
function validatePhone(phone) {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length < 10) return { valid: false, message: 'Минимум 10 цифр' };
  if (digitsOnly.length > 15) return { valid: false, message: 'Слишком длинный номер' };
  return { valid: true, message: '' };
}

function showPhoneError(message) {
  const errorEl = document.getElementById('phone-error');
  const formGroup = document.getElementById('client-phone').closest('.form-group');
  errorEl.textContent = '📱 ' + message;
  formGroup.classList.add('input-error');
  hapticError();
}

function clearPhoneError() {
  const errorEl = document.getElementById('phone-error');
  const formGroup = document.getElementById('client-phone').closest('.form-group');
  errorEl.textContent = '';
  formGroup.classList.remove('input-error');
}

function formatPhone(phone) {
  let digits = phone.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  
  let formatted = '+7';
  if (digits.length > 1) formatted += ' (' + digits.slice(1, 4);
  if (digits.length > 4) formatted += ') ' + digits.slice(4, 7);
  if (digits.length > 7) formatted += '-' + digits.slice(7, 9);
  if (digits.length > 9) formatted += '-' + digits.slice(9, 11);
  return formatted;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Инициализация
async function init() {
  showLoading();

  try {
    await loadAllData();
    state.bookings = loadBookings();

    const savedTheme = localStorage.getItem('manik_theme');
    applyThemeByName(savedTheme || 'main');

    renderWelcome();
    renderServices();
    renderConfirmation();
    showScreen('welcome-screen');
    state.initialized = true;

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) {
        preloader.classList.add('hidden');
        setTimeout(() => preloader.style.display = 'none', 300);
      }
    }, 800);

  } catch (error) {
    console.error('Init error:', error);
    showError(`Ошибка загрузки: ${error.message}`);
  }
}

// Админ-панель
function openAdminPanel() {
  showScreen('admin-screen');
  renderAdminSettings();
  renderAdminServices();
  renderAdminSchedule();
  renderAdminBookings();
}

function closeAdminPanel() {
  state.adminAuthenticated = false;
  showScreen('welcome-screen');
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.admin-tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.getElementById(`tab-${tabName}`)?.classList.add('active');

  if (tabName === 'schedule') renderAdminSchedule();
  else if (tabName === 'services') renderAdminServices();
  else if (tabName === 'bookings') renderAdminBookings();
  else if (tabName === 'stats') renderAdminStats();
}

function renderAdminSettings() {
  const nameEl = document.getElementById('admin-master-name');
  const descEl = document.getElementById('admin-master-desc');
  const photoEl = document.getElementById('admin-master-photo');
  const confirmEl = document.getElementById('admin-confirmation-text');

  if (nameEl) nameEl.value = state.settings.masterName || '';
  if (descEl) descEl.value = state.settings.masterDescription || '';
  if (photoEl) photoEl.value = state.settings.masterPhoto || '';
  if (confirmEl) confirmEl.value = state.settings.confirmationText || '';
}

function saveAdminSettings() {
  state.settings.masterName = document.getElementById('admin-master-name')?.value.trim() || '';
  state.settings.masterDescription = document.getElementById('admin-master-desc')?.value.trim() || '';
  state.settings.masterPhoto = document.getElementById('admin-master-photo')?.value.trim() || '';
  state.settings.confirmationText = document.getElementById('admin-confirmation-text')?.value.trim() || '';

  localStorage.setItem('manik_admin_settings', JSON.stringify(state.settings));
  // Обновляем кеш аватарки (если указали новый URL)
  preloadAndCacheAvatar(state.settings.masterPhoto);
  renderWelcome();
  hapticSuccess();
  alert('✅ Настройки сохранены!');
}

function renderAdminServices() {
  const container = document.getElementById('admin-services-list');
  if (state.services.length === 0) {
    container.innerHTML = '<p class="no-slots-message">Нет услуг</p>';
    return;
  }
  container.innerHTML = state.services.map((service, index) => `
    <div class="admin-service-item">
      <input type="text" value="${escapeHtml(service.name)}" placeholder="Название" data-idx="${index}" data-field="name" class="service-name-input">
      <input type="text" value="${escapeHtml(service.emoji || '')}" placeholder="Эмодзи" data-idx="${index}" data-field="emoji" class="service-emoji-input" style="width:50px;text-align:center;">
      <input type="number" value="${service.price}" placeholder="Цена" data-idx="${index}" data-field="price" class="service-price-input" style="width:70px;">
      <input type="number" value="${service.duration}" placeholder="Мин" data-idx="${index}" data-field="duration" class="service-duration-input" style="width:60px;">
      <button class="remove-btn" onclick="removeService(${index})">🗑️</button>
    </div>
  `).join('');
}

function removeService(index) {
  hapticClick();
  if (confirm('Удалить услугу?')) {
    state.services.splice(index, 1);
    renderAdminServices();
  }
}

function addService() {
  hapticClick();
  state.services.push({ name: '', emoji: '', price: '0', duration: 60 });
  renderAdminServices();
}

function saveAdminServices() {
  const inputs = document.querySelectorAll('.admin-service-item');
  const newServices = [];
  inputs.forEach(item => {
    const name = item.querySelector('.service-name-input')?.value.trim();
    const emoji = item.querySelector('.service-emoji-input')?.value.trim() || '';
    const price = item.querySelector('.service-price-input')?.value || '0';
    const duration = parseInt(item.querySelector('.service-duration-input')?.value) || 60;
    if (name) newServices.push({ name, emoji, price, duration });
  });
  state.services = newServices;
  localStorage.setItem('manik_admin_services', JSON.stringify(state.services));
  renderServices();
  hapticSuccess();
  alert('✅ Услуги сохранены!');
}

function renderAdminSchedule() {
  const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const container = document.getElementById('admin-schedule-list');
  if (!container) return;

  const scheduleByDay = {};
  for (let i = 0; i < 7; i++) {
    scheduleByDay[i] = state.schedule.find(s => {
      const date = new Date(s.date);
      return date.getDay() === i;
    }) || { dayOfWeek: i, startTime: i === 6 ? '' : '09:00', endTime: i === 6 ? '' : '20:00', breakStart: '', breakEnd: '' };
  }

  container.innerHTML = days.map((day, index) => {
    const sched = scheduleByDay[index];
    const isWorking = sched.startTime && sched.endTime;
    return `
      <div class="admin-schedule-item" data-day="${index}">
        <div class="schedule-header">
          <span class="day-name">${day}</span>
          <label class="toggle-switch">
            <input type="checkbox" data-day="${index}" class="schedule-working-check" ${isWorking ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">${isWorking ? 'Рабочий' : 'Выходной'}</span>
          </label>
        </div>
        <div class="schedule-times" ${isWorking ? '' : 'style="display:none;opacity:0.5;"'}>
          <div class="time-input-group">
            <label>Начало</label>
            <input type="time" value="${sched.startTime || '09:00'}" data-day="${index}" data-field="startTime" class="schedule-time-input" ${!isWorking ? 'disabled' : ''}>
          </div>
          <div class="time-input-group">
            <label>Конец</label>
            <input type="time" value="${sched.endTime || '20:00'}" data-day="${index}" data-field="endTime" class="schedule-time-input" ${!isWorking ? 'disabled' : ''}>
          </div>
        </div>
        <div class="schedule-break" ${isWorking ? '' : 'style="display:none;opacity:0.5;"'}>
          <label>Перерыв (необязательно)</label>
          <div class="break-inputs">
            <input type="time" value="${sched.breakStart || ''}" placeholder="Начало" data-day="${index}" data-field="breakStart" class="schedule-break-input" ${!isWorking ? 'disabled' : ''}>
            <span>—</span>
            <input type="time" value="${sched.breakEnd || ''}" placeholder="Конец" data-day="${index}" data-field="breakEnd" class="schedule-break-input" ${!isWorking ? 'disabled' : ''}>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.schedule-working-check').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const item = e.target.closest('.admin-schedule-item');
      const timesDiv = item.querySelector('.schedule-times');
      const breakDiv = item.querySelector('.schedule-break');
      const toggleLabel = item.querySelector('.toggle-label');
      const inputs = item.querySelectorAll('input[type="time"]');

      if (e.target.checked) {
        timesDiv.style.display = 'flex';
        breakDiv.style.display = 'block';
        timesDiv.style.opacity = '1';
        breakDiv.style.opacity = '1';
        toggleLabel.textContent = 'Рабочий';
        inputs.forEach(input => input.disabled = false);
      } else {
        timesDiv.style.display = 'flex';
        breakDiv.style.display = 'block';
        timesDiv.style.opacity = '0.5';
        breakDiv.style.opacity = '0.5';
        toggleLabel.textContent = 'Выходной';
        inputs.forEach(input => input.disabled = true);
      }
    });
  });
}

function saveAdminSchedule() {
  const items = document.querySelectorAll('.admin-schedule-item');
  const newSchedule = [];

  items.forEach(item => {
    const day = parseInt(item.dataset.day);
    const checkbox = item.querySelector('.schedule-working-check');
    const isWorking = checkbox.checked;

    if (isWorking) {
      const startTime = item.querySelector('.schedule-time-input[data-field="startTime"]')?.value;
      const endTime = item.querySelector('.schedule-time-input[data-field="endTime"]')?.value;
      const breakStart = item.querySelector('.schedule-break-input[data-field="breakStart"]')?.value;
      const breakEnd = item.querySelector('.schedule-break-input[data-field="breakEnd"]')?.value;

      if (startTime && endTime) {
        newSchedule.push({ dayOfWeek: day, startTime, endTime, breakStart: breakStart || '', breakEnd: breakEnd || '' });
      }
    }
  });

  state.schedule = newSchedule;
  localStorage.setItem('manik_admin_schedule', JSON.stringify(state.schedule));
  hapticSuccess();
  alert('✅ Расписание сохранено!');
  renderCalendar();
}

function renderAdminBookings() {
  const container = document.getElementById('admin-bookings-list');
  const bookings = Object.entries(state.bookings);
  if (bookings.length === 0) {
    container.innerHTML = '<p class="no-slots-message">Нет записей</p>';
    return;
  }
  bookings.sort((a, b) => {
    const dateA = a[1].date + ' ' + a[1].time;
    const dateB = b[1].date + ' ' + b[1].time;
    return new Date(dateA) - new Date(dateB);
  });
  container.innerHTML = bookings.map(([key, booking]) => `
    <div class="admin-booking-item">
      <div class="booking-client">${escapeHtml(booking.name)}</div>
      <div class="booking-info">📱 ${escapeHtml(booking.phone)}</div>
      <div class="booking-info">💅 ${escapeHtml(booking.serviceName)}</div>
      <div class="booking-info">📅 ${booking.date} в ${booking.time}</div>
      <div class="booking-actions">
        <button class="remove-btn" onclick="if(confirm('Удалить запись?')) removeBooking('${key}')">🗑️</button>
      </div>
    </div>
  `).join('');
  renderAdminStats();
}

function renderAdminStats() {
  const bookings = Object.values(state.bookings);
  const totalBookings = bookings.length;
  const totalRevenue = bookings.reduce((sum, b) => sum + (parseInt(b.price) || 0), 0);
  const uniqueClients = [...new Set(bookings.map(b => b.phone))].length;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = bookings.filter(b => new Date(b.date) >= weekAgo).length;

  document.getElementById('stat-total-bookings').textContent = totalBookings;
  document.getElementById('stat-total-revenue').textContent = totalRevenue.toLocaleString('ru-RU') + '₽';
  document.getElementById('stat-unique-clients').textContent = uniqueClients;
  document.getElementById('stat-this-week').textContent = thisWeek;

  const bonusTarget = 5;
  const bonusCurrent = totalBookings % bonusTarget;
  const bonusPercent = (bonusCurrent / bonusTarget) * 100;

  document.getElementById('bonus-current').textContent = bonusCurrent;
  document.getElementById('bonus-target').textContent = bonusTarget;
  document.getElementById('bonus-progress-fill').style.width = bonusPercent + '%';
}

function clearAllBookings() {
  hapticError();
  if (confirm('⚠️ Все записи будут удалены!')) {
    state.bookings = {};
    localStorage.removeItem(getStorageKey());
    renderAdminBookings();
    renderCalendar();
    alert('Все записи удалены');
  }
}

function changeAdminPassword() {
  const currentPasswordInput = document.getElementById('admin-current-password');
  const newPasswordInput = document.getElementById('admin-new-password');
  const confirmPasswordInput = document.getElementById('admin-confirm-password');
  const messageEl = document.getElementById('password-change-message');

  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const storedPassword = getAdminPassword();

  if (currentPassword !== storedPassword) {
    messageEl.textContent = '❌ Неверный текущий пароль';
    currentPasswordInput.parentElement.classList.add('input-error');
    hapticError();
    return;
  }

  if (newPassword.length < 6) {
    messageEl.textContent = '❌ Минимум 6 символов';
    newPasswordInput.parentElement.classList.add('input-error');
    hapticError();
    return;
  }

  if (newPassword !== confirmPassword) {
    messageEl.textContent = '❌ Пароли не совпадают';
    confirmPasswordInput.parentElement.classList.add('input-error');
    hapticError();
    return;
  }

  setAdminPassword(newPassword);
  messageEl.textContent = '✅ Пароль изменён!';
  hapticSuccess();

  currentPasswordInput.value = '';
  newPasswordInput.value = '';
  confirmPasswordInput.value = '';

  setTimeout(() => {
    messageEl.textContent = '';
    currentPasswordInput.parentElement.classList.remove('input-error');
    newPasswordInput.parentElement.classList.remove('input-error');
    confirmPasswordInput.parentElement.classList.remove('input-error');
  }, 3000);
}

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initTelegram();
  init();

  // Кнопки навигации
  document.getElementById('start-btn')?.addEventListener('click', () => { hapticClick(); showScreen('services-screen'); });
  document.getElementById('back-to-welcome')?.addEventListener('click', () => { hapticClick(); state.selectedService = null; showScreen('welcome-screen'); });
  document.getElementById('back-to-services')?.addEventListener('click', () => { hapticClick(); state.selectedDate = null; state.currentMonth = new Date(); showScreen('services-screen'); });
  document.getElementById('back-to-calendar')?.addEventListener('click', () => { hapticClick(); state.selectedSlot = null; showScreen('calendar-screen'); });
  document.getElementById('back-to-slots')?.addEventListener('click', () => { hapticClick(); state.selectedSlot = null; showScreen('slots-screen'); });
  document.getElementById('back-to-form')?.addEventListener('click', () => { hapticClick(); showScreen('form-screen'); });
  document.getElementById('prev-month')?.addEventListener('click', () => { hapticSelection(); state.currentMonth.setMonth(state.currentMonth.getMonth() - 1); renderCalendar(); });
  document.getElementById('next-month')?.addEventListener('click', () => { hapticSelection(); state.currentMonth.setMonth(state.currentMonth.getMonth() + 1); renderCalendar(); });
  document.getElementById('close-btn')?.addEventListener('click', () => { hapticClick(); tg.close(); });
  document.getElementById('retry-btn')?.addEventListener('click', () => { hapticClick(); init(); });
  document.getElementById('check-subscribe-btn')?.addEventListener('click', () => { hapticClick(); checkSubscribeAndContinue(); });

  // Темы
  document.querySelectorAll('.theme-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      hapticClick();
      const themeName = e.currentTarget.dataset.theme;
      applyThemeByName(themeName);
      document.querySelectorAll('.theme-preset').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
    });
  });

  // Форма телефона
  const phoneInput = document.getElementById('client-phone');
  phoneInput?.addEventListener('input', (e) => {
    const cursorPos = e.target.selectionStart;
    const oldLength = e.target.value.length;
    e.target.value = formatPhone(e.target.value);
    const newLength = e.target.value.length;
    e.target.setSelectionRange(cursorPos + (newLength - oldLength), cursorPos + (newLength - oldLength));
    if (e.target.value.length > 0) clearPhoneError();
  });

  // Форма записи
  document.getElementById('booking-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('client-name').value.trim();
    const phone = document.getElementById('client-phone').value.trim();

    // Проверка имени (только буквы, пробелы, дефисы)
    if (!name) { 
      alert('❌ Введите имя'); 
      return; 
    }
    
    // Проверка: имя должно содержать только буквы (кириллица/латиница)
    const nameRegex = /^[а-яА-ЯёЁa-zA-Z\s\-']+$/;
    if (!nameRegex.test(name)) {
      alert('❌ Имя должно содержать только буквы (без цифр и спецсимволов)');
      return;
    }
    
    // Проверка длины имени
    if (name.length < 2) {
      alert('❌ Имя должно быть не менее 2 символов');
      return;
    }

    const validation = validatePhone(phone);
    if (!validation.valid) { showPhoneError(validation.message); return; }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.classList.add('loading');

    try {
      const bookingData = {
        name: name,
        phone: phone,
        serviceName: state.selectedService.name,
        serviceDuration: state.selectedService.duration,
        date: formatDate(state.selectedDate),
        dateIso: formatDateKey(state.selectedDate),
        time: state.selectedSlot,
        price: state.selectedService.price.toString()
      };

      const dateKey = formatDateKey(state.selectedDate);
      saveBooking(dateKey, state.selectedSlot, bookingData);
      
      // Отправляем данные
      const sent = await sendBookingToBot(bookingData);
      
      hapticSuccess();
      submitBtn.classList.remove('loading');
      
      if (sent) {
        // Показываем подтверждение
        renderConfirmation();
        showScreen('confirmation-screen');
      } else {
        alert('❌ Не удалось отправить данные. Попробуйте ещё раз.');
      }
    } catch (error) {
      console.error('Booking error:', error);
      hapticError();
      submitBtn.classList.remove('loading');
      alert('Произошла ошибка при записи. Попробуйте еще раз.');
    }
  });

  // Админка
  document.getElementById('close-password-modal')?.addEventListener('click', closePasswordModal);
  document.getElementById('submit-password')?.addEventListener('click', checkPassword);
  document.getElementById('toggle-password-visibility')?.addEventListener('click', togglePasswordVisibility);
  document.getElementById('admin-password')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkPassword(); });
  document.getElementById('close-admin')?.addEventListener('click', () => { hapticClick(); closeAdminPanel(); });
  document.getElementById('exit-admin')?.addEventListener('click', () => { hapticClick(); closeAdminPanel(); });
  document.getElementById('save-settings')?.addEventListener('click', () => { hapticClick(); saveAdminSettings(); });
  document.getElementById('add-service-btn')?.addEventListener('click', addService);
  document.getElementById('save-services')?.addEventListener('click', () => { hapticClick(); saveAdminServices(); });
  document.getElementById('save-schedule')?.addEventListener('click', () => { hapticClick(); saveAdminSchedule(); });
  document.getElementById('clear-bookings')?.addEventListener('click', clearAllBookings);
  document.getElementById('change-password-btn')?.addEventListener('click', () => { hapticClick(); changeAdminPassword(); });

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      hapticSelection();
      switchAdminTab(e.currentTarget.dataset.tab);
    });
  });

  // Вход в админку (долгое нажатие 2 сек)
  let pressTimer;
  const masterNameEl = document.getElementById('master-name');
  const startPress = () => { pressTimer = setTimeout(() => { hapticSelection(); openPasswordModal(); }, 2000); };
  const cancelPress = () => clearTimeout(pressTimer);

  if (masterNameEl) {
    masterNameEl.addEventListener('touchstart', startPress);
    masterNameEl.addEventListener('touchend', cancelPress);
    masterNameEl.addEventListener('touchcancel', cancelPress);
    masterNameEl.addEventListener('mousedown', startPress);
    masterNameEl.addEventListener('mouseup', cancelPress);
    masterNameEl.addEventListener('mouseleave', cancelPress);
  }
});
