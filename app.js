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

    if (name === 'categories' && state.categories.length === 0 && db) {
        loadSummary().catch(err => console.error(err));
    }
    if (name === 'rating') loadLeaderboard();
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
   TEST TIZIMI
========================= */
const quizState = {
    participantId: null,
    participantName: '',
    pin: '',
    questions: [],
    answers: {},
    index: 0,
    startedAt: 0,
    timerHandle: null,
    busy: false
};

function rpcRows(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return [data];
    return [];
}
function rpcField(row, keys) {
    for (const key of keys) if (row?.[key] !== undefined && row[key] !== null) return row[key];
    return null;
}
function setAuthMessage(message, error = false) {
    const el = $('authMessage');
    if (el) { el.textContent = message; el.style.color = error ? 'var(--danger)' : 'var(--gold-light)'; }
}
function setQuizMessage(message, error = false) {
    const el = $('quizMessage');
    if (el) { el.textContent = message; el.style.color = error ? 'var(--danger)' : 'var(--gold-light)'; }
}
function setParticipant(id, name, pin) {
    quizState.participantId = id;
    quizState.participantName = name;
    quizState.pin = pin || '';
    $('quizAuth').hidden = true;
    $('quizProfile').hidden = false;
    $('quizPlay').hidden = true;
    $('quizResult').hidden = true;
    $('quizParticipantName').textContent = name;
    $('profileName').textContent = name;
    $('profileHint').textContent = 'Zakopediya test ishtirokchisi.';
    setQuizMessage('');
    loadParticipantHistory();
}
function clearParticipant() {
    quizState.participantId = null;
    quizState.participantName = '';
    quizState.pin = '';
    $('quizAuth').hidden = false;
    $('quizProfile').hidden = true;
    $('quizPlay').hidden = true;
    $('quizResult').hidden = true;
    $('quizPin').value = '';
    $('quizName').value = '';
    $('profileName').textContent = tg?.initDataUnsafe?.user?.first_name || 'Mehmon';
    $('profileHint').textContent = 'Test topshirish uchun ism va PIN bilan kiring.';
}
async function registerParticipant() {
    const name = $('quizName').value.trim();
    if (name.length < 1 || name.length > 40) return setAuthMessage('Ism 1–40 ta belgidan iborat bo‘lishi kerak.', true);
    $('registerBtn').disabled = $('loginBtn').disabled = true;
    setAuthMessage('Profil yaratilmoqda…');
    try {
        const { data, error } = await db.rpc('register_participant', { p_name: name });
        if (error) throw error;
        const row = rpcRows(data)[0] || {};
        const id = rpcField(row, ['participant_id','id','register_participant']);
        const pin = rpcField(row, ['pin','participant_pin','generated_pin']);
        const savedName = rpcField(row, ['participant_name','name']) || name;
        if (!id || !pin) throw new Error('Server javobida profil ID yoki PIN topilmadi. SQL funksiyasi javobini tekshirish kerak.');
        setParticipant(id, savedName, String(pin));
        notify(`Profil yaratildi!\n\nSizning PIN-kodingiz: ${pin}\n\nUni xavfsiz joyga yozib oling. PIN qayta ko‘rsatilmaydi.`);
    } catch (e) {
        console.error(e); setAuthMessage(e.message || 'Profil yaratishda xatolik.', true);
    } finally { $('registerBtn').disabled = $('loginBtn').disabled = false; }
}
async function loginParticipant() {
    const name = $('quizName').value.trim();
    const pin = $('quizPin').value.trim();
    if (!name || !/^\d{8}$/.test(pin)) return setAuthMessage('Ism va 8 xonali PIN-kodni kiriting.', true);
    $('registerBtn').disabled = $('loginBtn').disabled = true;
    setAuthMessage('Tekshirilmoqda…');
    try {
        const { data, error } = await db.rpc('login_participant', { p_name: name, p_pin: pin });
        if (error) throw error;
        const row = rpcRows(data)[0] || {};
        const id = rpcField(row, ['participant_id','id','login_participant']);
        const savedName = rpcField(row, ['participant_name','name']) || name;
        if (!id) throw new Error('Ism yoki PIN noto‘g‘ri, yoxud server javobi kutilgan formatda emas.');
        setParticipant(id, savedName, pin);
    } catch (e) { console.error(e); setAuthMessage(e.message || 'Kirish amalga oshmadi.', true); }
    finally { $('registerBtn').disabled = $('loginBtn').disabled = false; }
}
async function startQuiz(count) {
    if (!quizState.participantId || !quizState.pin) return notify('Avval profilga PIN orqali kiring.');
    setQuizMessage('Savollar yuklanmoqda…');
    document.querySelectorAll('.test-lengths button').forEach(b => b.disabled = true);
    try {
        const { data, error } = await db.rpc('get_random_quiz_questions', { p_count: count });
        if (error) throw error;
        const rows = rpcRows(data);
        if (rows.length !== count) throw new Error(`Bazadan ${count} ta o‘rniga ${rows.length} ta savol qaytdi. Savollar jadvalini tekshiring.`);
        quizState.questions = rows.map(q => ({
            id: Number(q.id),
            question: q.question,
            options: Array.isArray(q.options) ? q.options : JSON.parse(q.options || '[]')
        }));
        quizState.answers = {};
        quizState.index = 0;
        quizState.startedAt = Date.now();
        $('quizProfile').hidden = true;
        $('quizPlay').hidden = false;
        $('quizResult').hidden = true;
        renderQuizQuestion();
        if (quizState.timerHandle) clearInterval(quizState.timerHandle);
        quizState.timerHandle = setInterval(updateQuizTimer, 1000);
    } catch (e) { console.error(e); setQuizMessage(e.message || 'Savollarni yuklashda xatolik.', true); }
    finally { document.querySelectorAll('.test-lengths button').forEach(b => b.disabled = false); }
}
function updateQuizTimer() {
    if (!quizState.startedAt) return;
    const seconds = Math.floor((Date.now() - quizState.startedAt) / 1000);
    $('quizTimer').textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function renderQuizQuestion() {
    const q = quizState.questions[quizState.index];
    if (!q) return;
    $('quizProgressText').textContent = `${quizState.index + 1} / ${quizState.questions.length}`;
    $('quizProgressBar').style.width = `${((quizState.index + 1) / quizState.questions.length) * 100}%`;
    $('questionText').textContent = q.question;
    $('answerOptions').innerHTML = (q.options || []).map((option, i) => `
        <button class="answer-option${quizState.answers[q.id] === option ? ' selected' : ''}" data-option-index="${i}">
            <span class="option-letter">${String.fromCharCode(65+i)}.</span><span>${escapeHtml(option)}</span>
        </button>`).join('');
    $('answerOptions').querySelectorAll('.answer-option').forEach(btn => btn.addEventListener('click', () => {
        quizState.answers[q.id] = q.options[Number(btn.dataset.optionIndex)];
        renderQuizQuestion();
    }));
    $('questionPrev').disabled = quizState.index === 0;
    $('questionNext').textContent = quizState.index === quizState.questions.length - 1 ? 'Oxirgi savol' : 'Keyingi →';
    $('answeredCount').textContent = `Javob berilgan: ${Object.keys(quizState.answers).length} / ${quizState.questions.length}`;
}
async function finishQuiz() {
    if (quizState.busy) return;
    const unanswered = quizState.questions.length - Object.keys(quizState.answers).length;
    const confirmed = unanswered ? confirm(`${unanswered} ta savol javobsiz. Testni yakunlaysizmi?`) : confirm('Testni yakunlashni tasdiqlaysizmi?');
    if (!confirmed) return;
    quizState.busy = true;
    $('submitQuizBtn').disabled = true;
    try {
        if (quizState.timerHandle) clearInterval(quizState.timerHandle);
        const duration = Math.max(0, Math.floor((Date.now() - quizState.startedAt) / 1000));
        const answers = quizState.questions.map(q => ({ id: q.id, answer: quizState.answers[q.id] ?? '' }));
        const { data, error } = await db.rpc('submit_quiz', {
            p_participant_id: quizState.participantId,
            p_pin: quizState.pin,
            p_answers: answers,
            p_duration_seconds: duration
        });
        if (error) throw error;
        const row = rpcRows(data)[0] || {};
        const correct = Number(rpcField(row, ['correct_count','correct','score']) ?? 0);
        const total = Number(rpcField(row, ['question_count','total']) ?? quizState.questions.length);
        const percent = Number(rpcField(row, ['percent']) ?? Math.round(correct / total * 100));
        $('resultScore').textContent = `${correct} / ${total} (${percent}%)`;
        $('resultDetails').textContent = `Sarflangan vaqt: ${Math.floor(duration/60)} daqiqa ${duration%60} soniya. Natija saqlandi.`;
        $('quizPlay').hidden = true;
        $('quizResult').hidden = false;
        await loadParticipantHistory();
        await loadLeaderboard();
    } catch (e) {
        console.error(e);
        notify(`Natijani saqlashda xatolik: ${e.message}`);
        $('submitQuizBtn').disabled = false;
    } finally { quizState.busy = false; }
}
async function loadParticipantHistory() {
    if (!quizState.participantId || !quizState.pin) return;
    const box = $('historyList');
    if (!box) return;
    box.innerHTML = '<div class="loading">Tarix yuklanmoqda…</div>';
    try {
        const { data, error } = await db.rpc('get_participant_history', {
            p_participant_id: quizState.participantId,
            p_pin: quizState.pin
        });
        if (error) throw error;
        const rows = rpcRows(data);
        box.innerHTML = rows.length ? rows.map(r => `
            <div class="history-row">
                <div class="history-top"><span>${Number(r.question_count)} ta savol</span><strong>${Number(r.correct_count)}/${Number(r.question_count)} · ${Number(r.percent)}%</strong></div>
                <div class="history-meta">${new Date(r.created_at).toLocaleString('uz-UZ')} · ${Math.floor(Number(r.duration_seconds||0)/60)} daqiqa</div>
            </div>`).join('') : '<p class="muted-text">Hozircha test tarixi mavjud emas.</p>';
    } catch (e) {
        console.error(e); box.innerHTML = `<p class="muted-text">Tarixni yuklab bo‘lmadi: ${escapeHtml(e.message)}</p>`;
    }
}
async function loadLeaderboard() {
    const box = $('leaderboardList');
    if (!box || !db) return;
    box.innerHTML = '<div class="loading">Reyting yuklanmoqda…</div>';
    try {
        const { data, error } = await db.rpc('get_leaderboard');
        if (error) throw error;
        const rows = rpcRows(data);
        box.innerHTML = rows.length ? rows.map((r,i) => `
            <div class="leader-row"><div class="leader-left"><span class="leader-rank">${i+1}.</span><div><div class="leader-name">${escapeHtml(r.participant_name)}</div><div class="leader-meta">${Number(r.tests_count)} ta test · ${Number(r.total_correct)}/${Number(r.total_questions)} to‘g‘ri</div></div></div><div class="leader-score">${Number(r.average_percent)}%</div></div>`).join('') : '<p class="muted-text">Hozircha reyting uchun natijalar yo‘q.</p>';
    } catch (e) {
        console.error(e); box.innerHTML = `<p class="muted-text">Reytingni yuklab bo‘lmadi. Qo‘shimcha SQL funksiyalarini ishga tushirish kerak bo‘lishi mumkin. (${escapeHtml(e.message)})</p>`;
    }
}
function bindQuizEvents() {
    $('registerBtn').addEventListener('click', registerParticipant);
    $('loginBtn').addEventListener('click', loginParticipant);
    $('quizPin').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,8); });
    document.querySelectorAll('.test-lengths button').forEach(b => b.addEventListener('click', () => startQuiz(Number(b.dataset.count))));
    $('logoutBtn').addEventListener('click', clearParticipant);
    $('profileLogoutBtn').addEventListener('click', clearParticipant);
    $('questionPrev').addEventListener('click', () => { if (quizState.index > 0) { quizState.index--; renderQuizQuestion(); } });
    $('questionNext').addEventListener('click', () => { if (quizState.index < quizState.questions.length - 1) { quizState.index++; renderQuizQuestion(); } });
    $('submitQuizBtn').addEventListener('click', finishQuiz);
    $('newQuizBtn').addEventListener('click', () => {
        $('quizResult').hidden = true; $('quizProfile').hidden = false; setQuizMessage('Yangi testni tanlang.');
    });
}


/* =========================
   TUGMALAR VA HODISALAR
========================= */

function bindEvents() {
    bindQuizEvents();

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
    clearParticipant();

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
        await loadLeaderboard();

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
