/* ZAKOPEDIYA MINI APP — Supabase read-only first integration */

const SUPABASE_URL = 'https://yckayzhiutrvkmecjpbh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DiMeLr_LlNPJ3x9eaYcjtQ_s0Fdx-RS';
const PAGE_SIZE = 20;

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    try {
        tg.setHeaderColor('#101C2E');
        tg.setBackgroundColor('#101C2E');
    } catch (error) {
        console.info('Telegram rang sozlamalari qo‘llanmadi:', error);
    }
}

const supabaseLib = window.supabase;
const db = supabaseLib?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
    page: 'home',
    facts: [],
    categories: [],
    currentPage: 1,
    search: '',
    category: '',
    total: 0,
    selectedFact: null,
    lastPage: 'encyclopedia'
};

const $ = (id) => document.getElementById(id);
const pageElements = {
    home: $('homePage'), encyclopedia: $('encyclopediaPage'),
    categories: $('categoriesPage'), quiz: $('quizPage'),
    rating: $('ratingPage'), profile: $('profilePage'),
    factDetail: $('factDetailPage')
};

function notify(message) {
    if (tg?.showAlert) tg.showAlert(message);
    else window.alert(message);
}

function setStatus(message, kind = '') {
    const el = $('connectionStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status-line ${kind}`.trim();
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[char]);
}

function showPage(name) {
    if (!pageElements[name]) return;
    state.page = name;
    Object.entries(pageElements).forEach(([key, element]) => {
        element.classList.toggle('active', key === name);
    });
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.page === name || (name === 'factDetail' && item.dataset.page === 'encyclopedia'));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (name === 'encyclopedia' && state.facts.length === 0) loadFacts();
    if (name === 'categories' && state.categories.length === 0) loadCategories();
}

async function loadSummary() {
    if (!db) throw new Error('Supabase kutubxonasi yuklanmadi. Internet aloqasini tekshiring.');
    const [{ count, error: countError }, { data: categoryRows, error: categoryError }] = await Promise.all([
        db.from('articles').select('id', { count: 'exact', head: true }),
        db.from('articles').select('category').limit(5000)
    ]);
    if (countError) throw countError;
    if (categoryError) throw categoryError;

    const counts = new Map();
    (categoryRows || []).forEach(({ category }) => {
        const name = (category || '').trim() || 'Boshqa';
        counts.set(name, (counts.get(name) || 0) + 1);
    });
    state.categories = [...counts.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'uz'));

    $('totalFacts').textContent = Number(count ?? 0).toLocaleString('uz-UZ');
    $('totalCategories').textContent = state.categories.length.toLocaleString('uz-UZ');
    renderCategoryOptions();
    renderCategories();
    return Number(count ?? 0);
}

async function loadDailyFact() {
    if (!db) return;
    const { data, error } = await db.from('articles')
        .select('id,title,category,content')
        .order('id', { ascending: true })
        .limit(1);
    if (error) throw error;
    // Tasodifiy faktni kichik bazadan olish uchun tasodifiy offset ishlatiladi.
    const total = Number($('totalFacts').textContent.replace(/\D/g, '')) || 0;
    if (!total) return;
    const offset = Math.floor(Math.random() * total);
    const { data: randomRows, error: randomError } = await db.from('articles')
        .select('id,title,category,content')
        .order('id', { ascending: true })
        .range(offset, offset);
    if (randomError) throw randomError;
    const fact = randomRows?.[0] || data?.[0];
    if (!fact) return;
    $('dailyFact').innerHTML = `
        <div class="fact-top"><span>KUN FAKTI · ${escapeHtml(fact.category || 'Boshqa')}</span><span>✦</span></div>
        <h2>${escapeHtml(fact.title)}</h2>
        <p>${escapeHtml((fact.content || '').slice(0, 190))}${(fact.content || '').length > 190 ? '…' : ''}</p>
        <button class="text-button" id="openDailyFact">Batafsil o‘qish ↗</button>`;
    $('openDailyFact').addEventListener('click', () => openFact(fact, 'home'));
}

function renderCategoryOptions() {
    const select = $('categoryFilter');
    if (!select) return;
    const selected = state.category;
    select.innerHTML = '<option value="">Barcha kategoriyalar</option>' + state.categories
        .map(({ name, total }) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${total})</option>`).join('');
    select.value = selected;
}

function renderCategories() {
    const container = $('categoriesList');
    if (!container) return;
    if (!state.categories.length) {
        container.innerHTML = '<div class="empty-state">Hozircha kategoriyalar topilmadi.</div>';
        return;
    }
    container.innerHTML = state.categories.map(({ name, total }) => `
        <button class="category-card" data-category="${escapeHtml(name)}">
            <span class="category-symbol">◈</span><span class="category-name">${escapeHtml(name)}</span>
            <span class="category-count">${total} ta fakt</span><span class="category-arrow">›</span>
        </button>`).join('');
    container.querySelectorAll('.category-card').forEach((button) => {
        button.addEventListener('click', () => {
            state.category = button.dataset.category;
            state.currentPage = 1;
            $('categoryFilter').value = state.category;
            showPage('encyclopedia');
            loadFacts();
        });
    });
}

async function loadFacts() {
    if (!db) {
        $('factsList').innerHTML = '<div class="error-state">Supabase kutubxonasi yuklanmadi. Sahifani yangilang.</div>';
        return;
    }
    const container = $('factsList');
    container.innerHTML = '<div class="loading">Faktlar yuklanmoqda…</div>';
    $('prevPage').disabled = true;
    $('nextPage').disabled = true;

    let query = db.from('articles').select('id,title,category,content,created_at', { count: 'exact' });
    if (state.category) query = query.eq('category', state.category);
    if (state.search) {
        const term = state.search.replace(/[\\%_]/g, '\\$&');
        query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
    }
    const from = (state.currentPage - 1) * PAGE_SIZE;
    const { data, count, error } = await query.order('id', { ascending: false }).range(from, from + PAGE_SIZE - 1);

    if (error) {
        console.error('Faktlarni yuklash xatosi:', error);
        container.innerHTML = `<div class="error-state"><strong>Faktlarni yuklab bo‘lmadi.</strong><p>${escapeHtml(error.message)}</p><small>Supabase RLS siyosatida articles jadvali uchun SELECT ruxsati borligini tekshiring.</small></div>`;
        $('resultCount').textContent = '';
        $('pageInfo').textContent = '—';
        return;
    }

    state.facts = data || [];
    state.total = count || 0;
    const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    renderFacts();
    $('resultCount').textContent = `${state.total.toLocaleString('uz-UZ')} ta natija`;
    $('pageInfo').textContent = `${state.currentPage} / ${totalPages}`;
    $('prevPage').disabled = state.currentPage <= 1;
    $('nextPage').disabled = state.currentPage >= totalPages;
}

function renderFacts() {
    const container = $('factsList');
    if (!state.facts.length) {
        container.innerHTML = '<div class="empty-state">Bu so‘rov bo‘yicha fakt topilmadi.</div>';
        return;
    }
    container.innerHTML = state.facts.map((fact) => `
        <button class="fact-card" data-id="${fact.id}">
            <span class="fact-card-meta">${escapeHtml(fact.category || 'Boshqa')} <span>№ ${fact.id}</span></span>
            <strong>${escapeHtml(fact.title)}</strong>
            <span class="fact-preview">${escapeHtml((fact.content || '').slice(0, 150))}${(fact.content || '').length > 150 ? '…' : ''}</span>
            <span class="read-more">Batafsil o‘qish ↗</span>
        </button>`).join('');
    container.querySelectorAll('.fact-card').forEach((button) => {
        button.addEventListener('click', () => {
            const fact = state.facts.find((item) => String(item.id) === button.dataset.id);
            if (fact) openFact(fact, 'encyclopedia');
        });
    });
}

function openFact(fact, fromPage) {
    state.selectedFact = fact;
    state.lastPage = fromPage;
    $('factDetail').innerHTML = `
        <span class="fact-card-meta">${escapeHtml(fact.category || 'Boshqa')} <span>№ ${fact.id}</span></span>
        <h2>${escapeHtml(fact.title)}</h2>
        <div class="fact-content">${escapeHtml(fact.content || '').replace(/\n/g, '<br>')}</div>`;
    showPage('factDetail');
}

function debounce(callback, delay = 350) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => callback(...args), delay);
    };
}

const runSearch = debounce((value, source) => {
    state.search = value.trim();
    state.currentPage = 1;
    if (source === 'home') {
        $('factSearchInput').value = state.search;
        showPage('encyclopedia');
    } else {
        $('searchInput').value = state.search;
    }
    loadFacts();
}, 350);

function bindEvents() {
    document.querySelectorAll('[data-page]').forEach((button) => {
        button.addEventListener('click', () => {
            const page = button.dataset.page;
            if (page === 'encyclopedia' && state.page !== 'encyclopedia') {
                state.search = '';
                state.category = '';
                state.currentPage = 1;
                $('factSearchInput').value = '';
                $('categoryFilter').value = '';
            }
            showPage(page);
        });
    });
    $('profileBtn').addEventListener('click', () => showPage('profile'));
    $('searchInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') runSearch($('searchInput').value, 'home');
    });
    $('factSearchInput').addEventListener('input', (event) => runSearch(event.target.value, 'facts'));
    $('clearSearch').addEventListener('click', () => { $('searchInput').value = ''; state.search = ''; showPage('encyclopedia'); loadFacts(); });
    $('clearFactSearch').addEventListener('click', () => { $('factSearchInput').value = ''; state.search = ''; state.currentPage = 1; loadFacts(); });
    $('categoryFilter').addEventListener('change', (event) => { state.category = event.target.value; state.currentPage = 1; loadFacts(); });
    $('prevPage').addEventListener('click', () => { if (state.currentPage > 1) { state.currentPage--; loadFacts(); } });
    $('nextPage').addEventListener('click', () => { state.currentPage++; loadFacts(); });
    $('backFromFact').addEventListener('click', () => showPage(state.lastPage));
}

async function init() {
    bindEvents();
    const telegramUser = tg?.initDataUnsafe?.user;
    if (telegramUser) {
        const name = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
        $('profileName').textContent = name || 'Telegram foydalanuvchisi';
        $('profileHint').textContent = 'Telegram profilingiz Mini App orqali aniqlandi.';
    }

    if (!db) {
        setStatus('Supabase kutubxonasi yuklanmadi. Internetni tekshiring.', 'error');
        return;
    }
    try {
        const total = await loadSummary();
        await loadDailyFact();
        setStatus(`Supabase bilan aloqa muvaffaqiyatli · ${total.toLocaleString('uz-UZ')} ta fakt`, 'success');
    } catch (error) {
        console.error('Supabase ulanish xatosi:', error);
        setStatus(`Bazaga ulanishda xatolik: ${error.message}`, 'error');
    }
}

init();
