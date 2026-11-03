/**
 * Лукоморье — Меню ресторана
 * Клиентская логика: парсинг номера стола из URL, фильтрация блюд,
 * управление корзиной и отправка заказа в Telegram.
 */

// Состояние приложения
const state = {
  tableNumber: null,
  activeCategory: 'all',
  menuItems: [],
  cart: {}, // key: item.id -> { item, count }
  config: null
};

// ==========================================================================
// 1. Инициализация и парсинг URL
// ==========================================================================

function parseTableFromUrl() {
  const search = window.location.search; // Например: "?1", "?5", "?table=3"
  if (!search) return null;

  const raw = search.substring(1).trim(); // убираем "?"
  if (!raw) return null;

  // Случай 1: ссылка вида /?1 или /?12
  if (/^\d+$/.test(raw)) {
    return raw;
  }

  // Случай 2: ссылка вида /?1= (часто генерируется браузером для пустых параметров)
  if (/^(\d+)=?$/.test(raw)) {
    const match = raw.match(/^(\d+)/);
    if (match) return match[1];
  }

  // Случай 3: ссылка вида /?table=1 или /?stol=2 или /?t=3
  const urlParams = new URLSearchParams(search);
  for (const key of ['table', 'stol', 't', 'table_id', 'n']) {
    if (urlParams.has(key)) {
      const val = urlParams.get(key);
      if (val && /^\d+$/.test(val.trim())) {
        return val.trim();
      }
    }
  }

  // Если первый ключ является числом (например ?3&other=val)
  for (const [key] of urlParams.entries()) {
    if (/^\d+$/.test(key.trim())) {
      return key.trim();
    }
  }

  return null;
}

function updateTableUI() {
  const badge = document.getElementById('tableBadge');
  const banner = document.getElementById('noTableBanner');
  const modalBadge = document.getElementById('modalTableBadge');

  if (state.tableNumber) {
    badge.className = 'status-badge badge-table-ok';
    badge.innerHTML = `<span class="badge-icon">📍</span><span class="badge-label">Столик: <b>№ ${state.tableNumber}</b></span>`;
    banner.classList.add('hidden');
    if (modalBadge) modalBadge.textContent = `Столик № ${state.tableNumber}`;
  } else {
    badge.className = 'status-badge badge-warning';
    badge.innerHTML = `<span class="badge-icon">⚠️</span><span class="badge-label">Стол: <b>не указан</b></span>`;
    banner.classList.remove('hidden');
    if (modalBadge) modalBadge.textContent = 'Стол не указан!';
  }
}

// ==========================================================================
// 2. Загрузка меню из API
// ==========================================================================

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    state.config = await res.json();
  } catch (err) {
    console.error('Ошибка загрузки конфигурации:', err);
  }
}

async function fetchMenu() {
  const loadingEl = document.getElementById('loadingState');
  const emptyEl = document.getElementById('emptyState');
  const gridEl = document.getElementById('menuGrid');

  loadingEl.classList.remove('hidden');
  gridEl.innerHTML = '';

  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    state.menuItems = data.items || [];
    loadingEl.classList.add('hidden');

    renderMenu();
  } catch (err) {
    loadingEl.classList.add('hidden');
    gridEl.innerHTML = `<div class="empty-state"><p>Ошибка загрузки меню. Проверьте соединение с сервером.</p></div>`;
    console.error('Ошибка загрузки меню:', err);
  }
}

// ==========================================================================
// 3. Рендеринг блюд
// Согласно требованию: НАЗВАНИЯ БЛЮД НЕ ПОКАЗЫВАЮТСЯ, только фото, кол-во и кнопка
// ==========================================================================

function getCategoryRussianName(catKey) {
  switch (catKey) {
    case 'meat': return 'Мясное';
    case 'fish': return 'Рыбное';
    case 'other': return 'Прочее';
    default: return 'Блюдо';
  }
}

function renderMenu() {
  const gridEl = document.getElementById('menuGrid');
  const emptyEl = document.getElementById('emptyState');

  const filtered = state.menuItems.filter(item => {
    if (state.activeCategory === 'all') return true;
    return item.category === state.activeCategory;
  });

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
    gridEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');

  gridEl.innerHTML = filtered.map(item => {
    const categoryName = getCategoryRussianName(item.category);
    return `
      <article class="dish-card" data-id="${item.id}">
        <div class="dish-media" onclick="openLightbox('${item.image_url}')" title="Нажмите, чтобы приблизить фото">
          <span class="category-tag">${categoryName}</span>
          <img src="${item.image_url}" alt="Блюдо" loading="lazy" onerror="this.src='/static/img/placeholder.svg'">
          <div class="zoom-overlay">🔍</div>
        </div>

        <div class="dish-controls">
          <div class="quantity-stepper">
            <button class="step-btn" onclick="adjustCardQty('${item.id}', -1)" aria-label="Уменьшить">-</button>
            <span class="step-value" id="qty-${item.id}">1</span>
            <button class="step-btn" onclick="adjustCardQty('${item.id}', 1)" aria-label="Увеличить">+</button>
          </div>

          <button class="btn-order-action" id="btn-add-${item.id}" onclick="addToCart('${item.id}')">
            <span>В заказ</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

// Регулировка количества на карточке
window.adjustCardQty = function(itemId, delta) {
  const el = document.getElementById(`qty-${itemId}`);
  if (!el) return;
  let val = parseInt(el.textContent, 10) || 1;
  val = Math.max(1, Math.min(20, val + delta));
  el.textContent = val;
};

// ==========================================================================
// 4. Корзина и заказ
// ==========================================================================

window.addToCart = function(itemId) {
  // Проверка столика: если столика нет, предлагаем указать
  if (!state.tableNumber) {
    showToast('⚠️ Укажите номер вашего столика для заказа!');
    openModal('tablePromptModal');
    return;
  }

  const item = state.menuItems.find(i => i.id === itemId);
  if (!item) return;

  const qtyEl = document.getElementById(`qty-${itemId}`);
  const countToAdd = parseInt(qtyEl ? qtyEl.textContent : 1, 10) || 1;

  if (state.cart[itemId]) {
    state.cart[itemId].count += countToAdd;
  } else {
    state.cart[itemId] = {
      item: item,
      count: countToAdd
    };
  }

  // Анимация кнопки
  const btn = document.getElementById(`btn-add-${itemId}`);
  if (btn) {
    const originalText = btn.innerHTML;
    btn.classList.add('added');
    btn.innerHTML = `<span>Добавлено ✓</span>`;
    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML = originalText;
    }, 1200);
  }

  // Сбрасываем счетчик карточки на 1
  if (qtyEl) qtyEl.textContent = '1';

  updateCartUI();
  showToast(`Позиция добавлена в заказ!`);
};

function updateCartUI() {
  const cartEntries = Object.values(state.cart);
  const totalCount = cartEntries.reduce((sum, entry) => sum + entry.count, 0);

  const floatingBar = document.getElementById('floatingCart');
  const countBadge = document.getElementById('cartCountBadge');
  const summaryEl = document.getElementById('cartSummary');

  countBadge.textContent = totalCount;
  summaryEl.textContent = `${totalCount} ${pluralizeDishes(totalCount)} выбрано`;

  if (totalCount > 0) {
    floatingBar.classList.add('visible');
  } else {
    floatingBar.classList.remove('visible');
  }

  renderCartDrawer();
}

function pluralizeDishes(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'позиций';
  if (mod10 === 1) return 'позиция';
  if (mod10 >= 2 && mod10 <= 4) return 'позиции';
  return 'позиций';
}

function renderCartDrawer() {
  const listEl = document.getElementById('cartItemsList');
  const emptyEl = document.getElementById('cartEmptyMessage');
  const totalEl = document.getElementById('modalTotalItems');
  const submitBtn = document.getElementById('btnSubmitOrder');

  const entries = Object.entries(state.cart);

  if (entries.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    totalEl.textContent = '0 шт.';
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    return;
  }

  emptyEl.classList.add('hidden');
  submitBtn.disabled = false;
  submitBtn.style.opacity = '1';

  let totalItemsCount = 0;

  listEl.innerHTML = entries.map(([id, entry]) => {
    totalItemsCount += entry.count;
    const catName = getCategoryRussianName(entry.item.category);
    return `
      <div class="cart-item-row">
        <img class="cart-thumb" src="${entry.item.image_url}" alt="Фото">
        <div class="cart-item-meta">
          <div class="cart-category-label">${catName}</div>
          <div class="cart-count-label">Количество: <b>${entry.count} шт.</b></div>
        </div>
        <div class="cart-item-stepper">
          <button onclick="updateCartItemQty('${id}', -1)">-</button>
          <span>${entry.count}</span>
          <button onclick="updateCartItemQty('${id}', 1)">+</button>
        </div>
        <button class="btn-remove-item" onclick="removeCartItem('${id}')" title="Удалить">&times;</button>
      </div>
    `;
  }).join('');

  totalEl.textContent = `${totalItemsCount} шт.`;
}

window.updateCartItemQty = function(id, delta) {
  if (!state.cart[id]) return;
  state.cart[id].count += delta;
  if (state.cart[id].count <= 0) {
    delete state.cart[id];
  }
  updateCartUI();
};

window.removeCartItem = function(id) {
  delete state.cart[id];
  updateCartUI();
};

// ==========================================================================
// 5. Отправка заказа на кухню
// ==========================================================================

async function submitOrder() {
  if (!state.tableNumber) {
    closeModal('cartModal');
    openModal('tablePromptModal');
    showToast('Укажите столик перед отправкой заказа!');
    return;
  }

  const items = Object.values(state.cart).map(entry => ({
    id: entry.item.id,
    filename: entry.item.filename,
    dish_name: entry.item.dish_name,
    category: entry.item.category,
    count: entry.count,
    image_url: entry.item.image_url
  }));

  if (items.length === 0) {
    showToast('Корзина пуста');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitOrder');
  const originalBtnHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Отправка заказа...</span>`;

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: state.tableNumber,
        items: items
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || 'Не удалось отправить заказ');
    }

    // Успех! Очищаем корзину
    state.cart = {};
    updateCartUI();
    closeModal('cartModal');

    // Открываем модалку успеха
    document.getElementById('successTableNum').textContent = `№ ${state.tableNumber}`;
    openModal('orderSuccessModal');

  } catch (err) {
    alert(`Ошибка отправки заказа: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHtml;
  }
}

// ==========================================================================
// 6. Модальные окна и Lightbox
// ==========================================================================

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('hidden');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('hidden');
}

window.openLightbox = function(src) {
  const lb = document.getElementById('photoLightbox');
  const img = document.getElementById('lightboxImg');
  img.src = src;
  lb.classList.remove('hidden');
};

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 300);
  }, 2500);
}

// ==========================================================================
// 7. Навешивание слушателей событий
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Извлекаем столик из ссылки
  state.tableNumber = parseTableFromUrl();
  updateTableUI();

  // 2. Загружаем конфиг и блюда
  fetchConfig();
  fetchMenu();

  // 3. Переключение категорий
  const catButtons = document.querySelectorAll('.cat-pill');
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeCategory = btn.dataset.category;
      renderMenu();
    });
  });

  // 4. Плавающая корзина и модалка корзины
  document.getElementById('btnOpenCart').addEventListener('click', () => {
    openModal('cartModal');
  });

  document.getElementById('btnCloseCart').addEventListener('click', () => {
    closeModal('cartModal');
  });

  document.getElementById('btnSubmitOrder').addEventListener('click', submitOrder);

  // 5. Ручной ввод столика (если нет в ссылке)
  document.getElementById('btnManualTable').addEventListener('click', () => {
    openModal('tablePromptModal');
  });

  document.getElementById('tableBadge').addEventListener('click', () => {
    openModal('tablePromptModal');
  });

  document.getElementById('btnCloseTablePrompt').addEventListener('click', () => {
    closeModal('tablePromptModal');
  });

  document.getElementById('btnSaveTableNumber').addEventListener('click', () => {
    const input = document.getElementById('manualTableInput');
    const val = input.value.trim();
    if (val && /^\d+$/.test(val)) {
      state.tableNumber = val;
      updateTableUI();
      closeModal('tablePromptModal');
      showToast(`Столик № ${val} установлен`);
    } else {
      alert('Пожалуйста, введите корректный номер стола (число)');
    }
  });

  // Быстрые кнопки столиков (1, 2, 3...)
  document.querySelectorAll('.quick-table-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      state.tableNumber = val;
      updateTableUI();
      closeModal('tablePromptModal');
      showToast(`Столик № ${val} установлен`);
    });
  });

  // 6. Wi-Fi модалка
  document.getElementById('wifiBadge').addEventListener('click', () => {
    openModal('wifiModal');
  });

  document.getElementById('btnCloseWifiModal').addEventListener('click', () => {
    closeModal('wifiModal');
  });

  document.getElementById('btnConfirmWifi').addEventListener('click', () => {
    closeModal('wifiModal');
  });

  // 7. Модалка успешного заказа
  document.getElementById('btnCloseSuccess').addEventListener('click', () => {
    closeModal('orderSuccessModal');
  });

  // 8. Lightbox закрытие
  document.getElementById('btnCloseLightbox').addEventListener('click', () => {
    closeModal('photoLightbox');
  });

  document.getElementById('photoLightbox').addEventListener('click', (e) => {
    if (e.target.id === 'photoLightbox') {
      closeModal('photoLightbox');
    }
  });

  // Закрытие модалок по клику на фон
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
});
