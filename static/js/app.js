/**
 * Лукоморье — Меню заведения
 * Автоматический столик из ссылки (без вопросов), быстрый рендеринг,
 * мобильная адаптация и отправка заказов в Telegram.
 */

const state = {
  tableNumber: null,
  activeCategory: 'all',
  menuItems: [],
  cart: {} // id -> { item, count }
};

// ==========================================================================
// 1. Извлечение номера стола из ссылки (БЕЗ ВОПРОСОВ)
// Поддерживает:
// - http://domain/?1
// - http://domain/?5
// - http://domain/1
// - http://domain/5
// - http://domain/?table=2
// - http://domain/#1
// ==========================================================================

function getTableFromURL() {
  // 1. Проверяем query: ?1 или ?table=1
  const search = window.location.search.replace(/^\?/, '').trim();
  if (search) {
    if (/^\d+$/.test(search)) return search;
    const matchBare = search.match(/^(\d+)/);
    if (matchBare) return matchBare[1];

    const params = new URLSearchParams(window.location.search);
    for (const k of ['table', 'stol', 't', 'n']) {
      const val = params.get(k);
      if (val && /^\d+$/.test(val.trim())) return val.trim();
    }
  }

  // 2. Проверяем path: /1 или /2
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length > 0) {
    const lastPart = pathParts[pathParts.length - 1];
    if (/^\d+$/.test(lastPart)) return lastPart;
  }

  // 3. Проверяем hash: #1 или #table=1
  const hash = window.location.hash.replace(/^#/, '').trim();
  if (/^\d+$/.test(hash)) return hash;

  return null;
}

function initTableNumber() {
  state.tableNumber = getTableFromURL();

  const headerTableEl = document.getElementById('headerTableNum');
  const modalTableBadge = document.getElementById('modalTableBadge');

  if (state.tableNumber) {
    if (headerTableEl) headerTableEl.textContent = `№ ${state.tableNumber}`;
    if (modalTableBadge) modalTableBadge.textContent = `Столик № ${state.tableNumber}`;
  } else {
    // Если столик не был передан в ссылке, просто указываем нейтральный статус
    if (headerTableEl) headerTableEl.textContent = `не указан`;
    if (modalTableBadge) modalTableBadge.textContent = `Столик не указан`;
  }
}

// ==========================================================================
// 2. Загрузка меню (Мгновенно из кэша + фоновое обновление)
// ==========================================================================

async function loadMenu() {
  const loadingEl = document.getElementById('loadingState');
  
  // 1. Проверяем локальный кэш для моментального показа
  const cached = localStorage.getItem('lukomorie_menu_cache');
  if (cached) {
    try {
      const items = JSON.parse(cached);
      if (Array.isArray(items) && items.length > 0) {
        state.menuItems = items;
        if (loadingEl) loadingEl.classList.add('hidden');
        renderMenu();
      }
    } catch (e) {
      console.warn('Cache parse error', e);
    }
  }

  // 2. Запрашиваем свежие данные с сервера
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('/api/menu', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.menuItems = data.items || [];
    
    // Сохраняем в кэш
    localStorage.setItem('lukomorie_menu_cache', JSON.stringify(state.menuItems));

    if (loadingEl) loadingEl.classList.add('hidden');
    renderMenu();
  } catch (err) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (!state.menuItems || state.menuItems.length === 0) {
      const grid = document.getElementById('menuGrid');
      grid.innerHTML = `<div class="empty-state"><p>Не удалось загрузить меню. Проверьте соединение с сервером.</p></div>`;
    }
  }
}

// ==========================================================================
// 3. Рендеринг блюд (НАЗВАНИЙ НЕТ, только аппетитные фото, кол-во и кнопка)
// ==========================================================================

function getCategoryName(cat) {
  switch (cat) {
    case 'meat': return 'Мясное';
    case 'fish': return 'Рыбное';
    case 'other': return 'Прочее';
    default: return 'Блюдо';
  }
}

function renderMenu() {
  const grid = document.getElementById('menuGrid');
  const emptyEl = document.getElementById('emptyState');

  const filtered = state.menuItems.filter(item => {
    if (state.activeCategory === 'all') return true;
    return item.category === state.activeCategory;
  });

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
    grid.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');

  grid.innerHTML = filtered.map(item => {
    const catTitle = getCategoryName(item.category);
    return `
      <article class="dish-card" data-id="${item.id}">
        <div class="dish-media" onclick="openLightbox('${item.image_url}')">
          <span class="category-tag">${catTitle}</span>
          <img src="${item.image_url}" alt="Фото блюда" loading="lazy" onerror="this.src='/static/img/placeholder.svg'">
          <div class="zoom-overlay">🔍</div>
        </div>

        <div class="dish-controls">
          <div class="quantity-stepper">
            <button type="button" class="step-btn" onclick="adjustCardQty('${item.id}', -1)" aria-label="Меньше">-</button>
            <span class="step-value" id="qty-${item.id}">1</span>
            <button type="button" class="step-btn" onclick="adjustCardQty('${item.id}', 1)" aria-label="Больше">+</button>
          </div>

          <button type="button" class="btn-order-action" id="btn-add-${item.id}" onclick="addToCart('${item.id}')">
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

window.adjustCardQty = function(id, delta) {
  const el = document.getElementById(`qty-${id}`);
  if (!el) return;
  let val = parseInt(el.textContent, 10) || 1;
  val = Math.max(1, Math.min(20, val + delta));
  el.textContent = val;
};

// ==========================================================================
// 4. Корзина и заказ
// ==========================================================================

window.addToCart = function(id) {
  const item = state.menuItems.find(i => i.id === id);
  if (!item) return;

  const qtyEl = document.getElementById(`qty-${id}`);
  const count = parseInt(qtyEl ? qtyEl.textContent : 1, 10) || 1;

  if (state.cart[id]) {
    state.cart[id].count += count;
  } else {
    state.cart[id] = { item, count };
  }

  // Анимация кнопки
  const btn = document.getElementById(`btn-add-${id}`);
  if (btn) {
    const orig = btn.innerHTML;
    btn.classList.add('added');
    btn.innerHTML = `<span>Добавлено ✓</span>`;
    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML = orig;
    }, 900);
  }

  if (qtyEl) qtyEl.textContent = '1';
  updateCartUI();
  showToast('Позиция добавлена в заказ');
};

function updateCartUI() {
  const entries = Object.values(state.cart);
  const totalCount = entries.reduce((s, e) => s + e.count, 0);

  const bar = document.getElementById('floatingCart');
  const countBadge = document.getElementById('cartCountBadge');
  const summary = document.getElementById('cartSummary');

  if (countBadge) countBadge.textContent = totalCount;
  if (summary) summary.textContent = `${totalCount} блюд выбрано`;

  if (totalCount > 0) {
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }

  renderCartDrawer();
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
    const catName = getCategoryName(entry.item.category);
    return `
      <div class="cart-item-row">
        <img class="cart-thumb" src="${entry.item.image_url}" alt="Фото">
        <div class="cart-item-meta">
          <div class="cart-category-label">${catName}</div>
          <div class="cart-count-label">Кол-во: <b>${entry.count} шт.</b></div>
        </div>
        <div class="cart-item-stepper">
          <button type="button" onclick="updateCartItemQty('${id}', -1)">-</button>
          <span>${entry.count}</span>
          <button type="button" onclick="updateCartItemQty('${id}', 1)">+</button>
        </div>
        <button type="button" class="btn-remove-item" onclick="removeCartItem('${id}')">&times;</button>
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
// 5. Отправка заказа
// ==========================================================================

async function submitOrder() {
  if (!state.tableNumber) {
    showToast('⚠️ Номер стола не найден в ссылке! Отсканируйте QR-код на столике.');
    return;
  }

  const items = Object.values(state.cart).map(e => ({
    id: e.item.id,
    filename: e.item.filename,
    dish_name: e.item.dish_name,
    category: e.item.category,
    count: e.count,
    image_url: e.item.image_url
  }));

  if (items.length === 0) {
    showToast('Корзина пуста');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitOrder');
  const origHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Отправка заказа на кухню...</span>`;

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
    if (!res.ok) throw new Error(data.detail || 'Ошибка отправки');

    // Успех! Очищаем корзину
    state.cart = {};
    updateCartUI();
    closeModal('cartModal');

    document.getElementById('successTableNum').textContent = `№ ${state.tableNumber}`;
    openModal('orderSuccessModal');

  } catch (err) {
    alert(`Ошибка: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = origHtml;
  }
}

// ==========================================================================
// 6. Модальные окна
// ==========================================================================

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
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
  }, 2200);
}

// ==========================================================================
// 7. Инициализация при старте
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initTableNumber();
  loadMenu();

  // Фильтр категорий
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeCategory = btn.dataset.category;
      renderMenu();
    });
  });

  // Корзина
  document.getElementById('btnOpenCart').addEventListener('click', () => openModal('cartModal'));
  document.getElementById('btnCloseCart').addEventListener('click', () => closeModal('cartModal'));
  document.getElementById('btnSubmitOrder').addEventListener('click', submitOrder);

  // Успех
  document.getElementById('btnCloseSuccess').addEventListener('click', () => closeModal('orderSuccessModal'));

  // Lightbox
  document.getElementById('btnCloseLightbox').addEventListener('click', () => closeModal('photoLightbox'));
  document.getElementById('photoLightbox').addEventListener('click', (e) => {
    if (e.target.id === 'photoLightbox') closeModal('photoLightbox');
  });

  // Закрытие по клику на фон
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
});
