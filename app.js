/* ZAKOPEDIYA MINI APP — Supabase + Alifbo filtri */

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
const db = supabaseLib?.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const state = {
    page: 'home',
    facts: [],
    allFacts: null,
    letter: '',
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
    home: $('homePage'),
    encyclopedia: $('encyclopediaPage'),
    categories: $('categoriesPage'),
    quiz: $('quizPage'),
    rating: $('ratingPage'),
    profile: $('profilePage'),
    factDetail: $('factDetailPage')
};

function notify(message) {
    if (tg?.showAlert) {
        tg.showAlert(message);
    } else {
        window.alert(message);
    }
}

function setStatus(message, kind = '') {
    const el = $('connectionStatus');

    if (!el) return;

    el.textContent = message;
    el.className = `status-line ${kind}`.trim();
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);
}

function showPage(name) {
    if (!pageElements[name]) return;

    state.page = name;

    Object.entries(pageElements).forEach(([key, element]) => {
        element.classList.toggle('active', key === name);
    });

    document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle(
            'active',
            item.dataset.page === name ||
            (name === 'factDetail' && item.dataset.page === 'encyclopedia')
        );
    });

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });

    if (name === 'encyclopedia' && state.facts.length === 0) {
        loadFacts();
    }

    if (name === 'categories' && state.categories.length === 0) {
        loadCategories();
    }
}

/* =========================
   UMUMIY MA'LUMOTLAR
========================= */

async function loadSummary() {
    if (!db) {
        throw new Error(
            'Supabase kutubxonasi yuklanmadi. Internet aloqasini tekshiring.'
        );
    }

    const [
        { count, error: countError },
        { data: categoryRows, error: categoryError }
    ] = await Promise.all([
        db.from('articles').select('id', {
            count: 'exact',
            head: true
        }),

        db.from('articles').select('category').limit(5000)
    ]);

    if (countError) throw countError;
    if (categoryError) throw categoryError;

    const counts = new Map();

    (categoryRows || []).forEach(({ category }) => {
        const name = (category || '').trim() || 'Boshqa';

        counts.set(
            name,
            (counts.get(name) || 0) + 1
        );
    });

    state.categories = [...counts.entries()]
        .map(([name, total]) => ({
            name,
            total
        }))
        .sort((a, b) =>
            b.total - a.total ||
            a.name.localeCompare(b.name, 'uz')
        );

    $('totalFacts').textContent =
        Number(count ?? 0).toLocaleString('uz-UZ');

    $('totalCategories').textContent =
        state.categories.length.toLocaleString('uz-UZ');

    renderCategoryOptions();
    renderCategories();

    return Number(count ?? 0);
}

/* =========================
   KUN FAKTI
========================= */

async function loadDailyFact() {
    if (!db) return;

    const { data, error } = await db
        .from('articles')
        .select('id,title,category,content')
        .order('id', { ascending: true })
        .limit(1);

    if (error) throw error;

    const total =
        Number($('totalFacts').textContent.replace(/\D/g, '')) || 0;

    if (!total) return;

    const offset = Math.floor(Math.random() * total);

    const {
        data: randomRows,
        error: randomError
    } = await db
        .from('articles')
        .select('id,title,category,content')
        .order('id', { ascending: true })
        .range(offset, offset);

    if (randomError) throw randomError;

    const fact = randomRows?.[0] || data?.[0];

    if (!fact) return;

    $('dailyFact').innerHTML = `
        <div class="fact-top">
            <span>KUN FAKTI · ${escapeHtml(fact.category || 'Boshqa')}</span>
            <span>✦</span>
        </div>

        <h2>${escapeHtml(fact.title)}</h2>

        <p>
            ${escapeHtml((fact.content || '').slice(0, 190))}
            ${(fact.content || '').length > 190 ? '…' : ''}
        </p>

        <button class="text-button" id="openDailyFact">
            Batafsil o‘qish ↗
        </button>
    `;

    $('openDailyFact').addEventListener('click', () => {
        openFact(fact, 'home');
    });
}

/* =========================
   KATEGORIYALAR
========================= */

function renderCategoryOptions() {
    const select = $('categoryFilter');

    if (!select) return;

    const selected = state.category;

    select.innerHTML =
        '<option value="">Barcha kategoriyalar</option>' +
        state.categories.map(({ name, total }) => `
            <option value="${escapeHtml(name)}">
                ${escapeHtml(name)} (${total})
            </option>
        `).join('');

    select.value = selected;
}

function renderCategories() {
    const container = $('categoriesList');

    if (!container) return;

    if (!state.categories.length) {
        container.innerHTML = `
            <div class="empty-state">
                Hozircha kategoriyalar topilmadi.
            </div>
        `;
        return;
    }

    container.innerHTML = state.categories.map(({ name, total }) => `
        <button
            class="category-card"
            data-category="${escapeHtml(name)}"
        >
            <span class="category-symbol">◈</span>

            <span class="category-name">
                ${escapeHtml(name)}
            </span>

            <span class="category-count">
                ${total} ta fakt
            </span>

            <span class="category-arrow">›</span>
        </button>
    `).join('');

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

/* =========================
   O'ZBEK ALIFBOSI
========================= */

const UZ_ALPHABET = [
    'A', 'B', 'D', 'E', 'F', 'G', 'G‘',
    'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'O‘', 'P', 'Q', 'R', 'S', 'T',
    'U', 'V', 'X', 'Y', 'Z', 'Sh', 'Ch', 'Ng'
];

/* Sarlavha boshidagi belgilarni olib tashlash */

function cleanTitleStart(title = '') {
    return String(title)
        .trim()
        .replace(/^[\s\p{P}\p{S}]+/u, '')
        .toLocaleLowerCase('uz-UZ');
}

/* Fakt qaysi harf bilan boshlanishini aniqlash */

function getInitialLetter(title = '') {
    const value = cleanTitleStart(title);

    if (!value) return '';

    if (/^\d/.test(value)) return '#';

    if (/^sh/.test(value)) return 'Sh';

    if (/^ch/.test(value)) return 'Ch';

    if (/^ng/.test(value)) return 'Ng';

    if (/^g['ʻʼ’‘`]/.test(value)) return 'G‘';

    if (/^o['ʻʼ’‘`]/.test(value)) return 'O‘';

    const first = value[0].toLocaleUpperCase('uz-UZ');

    return UZ_ALPHABET.includes(first) ? first : '';
}

/* Faktlarni alifbo tartibida saralash */

function compareUzbekTitles(a, b) {
    const aLetter = getInitialLetter(a.title);
    const bLetter = getInitialLetter(b.title);

    const aIndex =
        aLetter === '#' ? 99 : UZ_ALPHABET.indexOf(aLetter);

    const bIndex =
        bLetter === '#' ? 99 : UZ_ALPHABET.indexOf(bLetter);

    if (aIndex !== bIndex) {
        return aIndex - bIndex;
    }

    return cleanTitleStart(a.title).localeCompare(
        cleanTitleStart(b.title),
        'uz'
    );
}

/* Alifbo tugmalarini chiqarish */

function renderAlphabet() {
    const el = $('alphabetFilter');

    if (!el) return;

    const choices = [
        {
            label: 'Barchasi',
            value: ''
        },

        ...UZ_ALPHABET.map(letter => ({
            label: letter,
            value: letter
        })),

        {
            label: '0–9',
            value: '#'
        }
    ];

    el.innerHTML = choices.map(({ label, value }) => `
        <button
            type="button"
            class="alphabet-btn${state.letter === value ? ' active' : ''}"
            data-letter="${escapeHtml(value)}"
            aria-pressed="${state.letter === value ? 'true' : 'false'}"
        >
            ${escapeHtml(label)}
        </button>
    `).join('');

    const result = $('alphabetResult');

    if (result) {
        result.textContent = state.letter
            ? `${state.letter === '#' ? 'Raqamlar' : state.letter} bo‘yicha`
            : 'Barcha harflar';
    }
}

/* =========================
   BARCHA FAKTLARNI YUKLASH
========================= */

async function fetchAllFacts() {
    if (state.allFacts !== null) {
        return state.allFacts;
    }

    const all = [];

    let from = 0;

    const batchSize = 500;

    while (true) {
        const {
            data,
            error
        } = await db
            .from('articles')
            .select('id,title,category,content,created_at')
            .order('id', { ascending: true })
            .range(from, from + batchSize - 1);

        if (error) throw error;

        const batch = data || [];

        all.push(...batch);

        if (batch.length < batchSize) {
            break;
        }

        from += batchSize;
    }

    state.allFacts = all;

    return all;
}

/* =========================
   FAKTLARNI YUKLASH
========================= */

async function loadFacts() {
    if (!db) {
        $('factsList').innerHTML = `
            <div class="error-state">
                Supabase kutubxonasi yuklanmadi. Sahifani yangilang.
            </div>
        `;
        return;
    }

    const container = $('factsList');

    container.innerHTML = `
        <div class="loading">
            Faktlar yuklanmoqda…
        </div>
    `;

    $('prevPage').disabled = true;
    $('nextPage').disabled = true;

    try {
        let filtered = await fetchAllFacts();

        /* Kategoriya bo‘yicha filtrlash */

        if (state.category) {
            filtered = filtered.filter(f =>
                (f.category || 'Boshqa') === state.category
            );
        }

        /* Harf bo‘yicha filtrlash */

        if (state.letter) {
            filtered = filtered.filter(f =>
                getInitialLetter(f.title) === state.letter
            );
        }

        /* Qidiruv */

        if (state.search) {
            const term = state.search.toLocaleLowerCase('uz-UZ');

            filtered = filtered.filter(f =>
                `${f.title || ''} ${f.content || ''}`
                    .toLocaleLowerCase('uz-UZ')
                    .includes(term)
            );
        }

        /* Alifbo bo‘yicha saralash */

        filtered = [...filtered].sort(compareUzbekTitles);

        state.total = filtered.length;

        const totalPages = Math.max(
            1,
            Math.ceil(state.total / PAGE_SIZE)
        );

        if (state.currentPage > totalPages) {
            state.currentPage = totalPages;
        }

        const from = (state.currentPage - 1) * PAGE_SIZE;

        state.facts = filtered.slice(
            from,
            from + PAGE_SIZE
        );

        renderAlphabet();
        renderFacts();

        $('resultCount').textContent =
            `${state.total.toLocaleString('uz-UZ')} ta natija`;

        $('pageInfo').textContent =
            `${state.currentPage} / ${totalPages}`;

        $('prevPage').disabled =
            state.currentPage <= 1;

        $('nextPage').disabled =
            state.currentPage >= totalPages;

    } catch (error) {
        console.error('Faktlarni yuklash xatosi:', error);

        container.innerHTML = `
            <div class="error-state">
                <strong>Faktlarni yuklab bo‘lmadi.</strong>
                <p>${escapeHtml(error.message)}</p>
            </div>
        `;

        $('resultCount').textContent = '';
        $('pageInfo').textContent = '—';
    }
}

/* =========================
   FAKTLARNI EKRANGA CHIQARISH
========================= */

function renderFacts() {
    const container = $('factsList');

    if (!state.facts.length) {
        container.innerHTML = `
            <div class="empty-state">
                Bu so‘rov bo‘yicha fakt topilmadi.
            </div>
        `;
        return;
    }

    container.innerHTML = state.facts.map((fact) => `
        <button
            class="fact-card"
            data-id="${fact.id}"
        >
            <span class="fact-card-meta">
                ${escapeHtml(fact.category || 'Boshqa')}
                <span>№ ${fact.id}</span>
            </span>

            <strong>
                ${escapeHtml(fact.title)}
            </strong>

            <span class="fact-preview">
                ${escapeHtml((fact.content || '').slice(0, 150))}
                ${(fact.content || '').length > 150 ? '…' : ''}
            </span>

            <span class="read-more">
                Batafsil o‘qish ↗
            </span>
        </button>
    `).join('');

    container.querySelectorAll('.fact-card').forEach((button) => {
        button.addEventListener('click', () => {
            const fact = state.facts.find(
                item => String(item.id) === button.dataset.id
            );

            if (fact) {
                openFact(fact, 'encyclopedia');
            }
        });
    });
}

/* =========================
   FAKTNI BATAFSIL OCHISH
========================= */

function openFact(fact, fromPage) {
    state.selectedFact = fact;
    state.lastPage = fromPage;

    $('factDetail').innerHTML = `
        <span class="fact-card-meta">
            ${escapeHtml(fact.category || 'Boshqa')}
            <span>№ ${fact.id}</span>
        </span>

        <h2>${escapeHtml(fact.title)}</h2>

        <div class="fact-content">
            ${escapeHtml(fact.content || '').replace(/\n/g, '<br>')}
        </div>
    `;

    showPage('factDetail');
}

/* =========================
   QIDIRUV
========================= */

function debounce(callback, delay = 350) {
    let timer;

    return (...args) => {
        clearTimeout(timer);

        timer = setTimeout(() => {
            callback(...args);
        }, delay);
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

/* =========================
   TUGMALAR VA HODISALAR
========================= */

function bindEvents() {

    /* Navigatsiya */

    document.querySelectorAll('[data-page]').forEach((button) => {
        button.addEventListener('click', () => {
            const page = button.dataset.page;

            if (
                page === 'encyclopedia' &&
                state.page !== 'encyclopedia'
            ) {
                state.search = '';
                state.category = '';
                state.letter = '';
                state.currentPage = 1;

                $('factSearchInput').value = '';
                $('categoryFilter').value = '';
            }

            showPage(page);
        });
    });

    $('profileBtn').addEventListener('click', () => {
        showPage('profile');
    });

    /* Bosh sahifadagi qidiruv */

    $('searchInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            runSearch($('searchInput').value, 'home');
        }
    });

    /* Ensiklopediyadagi qidiruv */

    $('factSearchInput').addEventListener('input', (event) => {
        runSearch(event.target.value, 'facts');
    });

    /* Qidiruvni tozalash */

    $('clearSearch').addEventListener('click', () => {
        $('searchInput').value = '';
        state.search = '';

        showPage('encyclopedia');
        loadFacts();
    });

    $('clearFactSearch').addEventListener('click', () => {
        $('factSearchInput').value = '';
        state.search = '';
        state.currentPage = 1;

        loadFacts();
    });

    /* Kategoriya filtri */

    $('categoryFilter').addEventListener('change', (event) => {
        state.category = event.target.value;
        state.currentPage = 1;

        loadFacts();
    });

    /* ALIFBO FILTRI */

    $('alphabetFilter')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-letter]');

        if (!button) return;

        state.letter = button.dataset.letter;
        state.currentPage = 1;

        renderAlphabet();
        loadFacts();
    });

    /* Sahifalar */

    $('prevPage').addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            loadFacts();
        }
    });

    $('nextPage').addEventListener('click', () => {
        state.currentPage++;
        loadFacts();
    });

    /* Faktdan orqaga qaytish */

    $('backFromFact').addEventListener('click', () => {
        showPage(state.lastPage);
    });
}

/* =========================
   BOSHLANG‘ICH ISHGA TUSHIRISH
========================= */

async function init() {
    bindEvents();

    renderAlphabet();

    const telegramUser = tg?.initDataUnsafe?.user;

    if (telegramUser) {
        const name = [
            telegramUser.first_name,
            telegramUser.last_name
        ].filter(Boolean).join(' ');

        $('profileName').textContent =
            name || 'Telegram foydalanuvchisi';

        $('profileHint').textContent =
            'Telegram profilingiz Mini App orqali aniqlandi.';
    }

    if (!db) {
        setStatus(
            'Supabase kutubxonasi yuklanmadi. Internetni tekshiring.',
            'error'
        );
        return;
    }

    try {
        const total = await loadSummary();

        await loadDailyFact();

        setStatus(
            `Supabase bilan aloqa muvaffaqiyatli · ${total.toLocaleString('uz-UZ')} ta fakt`,
            'success'
        );

    } catch (error) {
        console.error('Supabase ulanish xatosi:', error);

        setStatus(
            `Bazaga ulanishda xatolik: ${error.message}`,
            'error'
        );
    }
}

init();
