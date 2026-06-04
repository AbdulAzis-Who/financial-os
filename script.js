// ==================== 🟢 KONFIGURASI SUPABASE TERPUSAT ====================
const SUPABASE_URL = "https://vvzaugwgqqcnapfkmbyx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2emF1Z3dncXFjbmFwZmttYnl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODk3NzEsImV4cCI6MjA5NjA2NTc3MX0.sG6kzNrV0YZYZg_fv0qzdk2T4ZH86qhjCYKFGwrCWjE";

// Inisialisasi Klien Supabase
const { createClient } = supabase; 
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== FONDASI DATABASE BERBASIS LEDGER (DENGAN BACKUP LOCALSTORAGE) ======
let db = JSON.parse(localStorage.getItem('fosv10')) || {
    goal: 0, 
    crypto: [], 
    stocks: [], 
    metals: [], 
    cash: [], 
    equity: [], 
    equityLabels: [],
    transactions: [] 
};
let USDIDR = 16000, pie, equity;

const idr = x => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(x || 0);

function save() { 
    localStorage.setItem('fosv10', JSON.stringify(db)); 
    render(); 
}

// ==================== 🕹️ FUNGSI NAVIGASI FORM AUTH ====================
function toggleAuthForm(mode) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (!loginForm || !registerForm) return;

    if (mode === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    } else {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    }
}

// ==================== 🕹️ FUNGSI AUTHENTICATION & SYNC (CLOUD) ====================

// 1. Fungsi Ambil Data dari Server Supabase Terpusat (PULL DATA)
async function loadUserDataFromServer() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        showToast("Sinkronisasi data cloud...", "info");

        // Tarik data secara paralel dari 4 tabel database di Singapura
        const [cryptoRes, stocksRes, metalsRes, cashRes] = await Promise.all([
            supabaseClient.from('tb_crypto').select('*'),
            supabaseClient.from('tb_stocks').select('*'),
            supabaseClient.from('tb_metals').select('*'),
            supabaseClient.from('tb_cash').select('*')
        ]);

        // Bersihkan data transaksi lokal sebelum diisi data cloud yang fresh
        db.transactions = [];
        db.cash = [];

        // Gabungkan data Crypto ke Ledger Transaksi Utama
        if (cryptoRes.data) {
            cryptoRes.data.forEach(c => {
                db.transactions.push({
                    id: c.id,
                    category: 'crypto',
                    type: 'beli',
                    assetId: c.coin_id,
                    qty: Number(c.quantity),
                    entryPrice: Number(c.total_entry) / Number(c.quantity),
                    totalModal: Number(c.total_entry),
                    cur: c.currency || 'idr',
                    date: new Date(c.created_at).toLocaleDateString('id-ID')
                });
            });
        }

        // Gabungkan data Saham ke Ledger Transaksi Utama
        if (stocksRes.data) {
            stocksRes.data.forEach(s => {
                db.transactions.push({
                    id: s.id,
                    category: 'stocks',
                    type: 'beli',
                    assetId: s.ticker,
                    qty: Number(s.quantity_lot),
                    entryPrice: Number(s.price_per_share),
                    date: new Date(s.created_at).toLocaleDateString('id-ID')
                });
            });
        }

        // Gabungkan data Logam Mulia ke Ledger Transaksi Utama
        if (metalsRes.data) {
            metalsRes.data.forEach(m => {
                db.transactions.push({
                    id: m.id,
                    category: 'metals',
                    type: 'beli',
                    assetId: m.metal_type,
                    qty: Number(m.weight_gram),
                    entryPrice: Number(m.price_per_gram),
                    date: new Date(m.created_at).toLocaleDateString('id-ID')
                });
            });
        }

        // Masukkan data Aliran Kas (Modal)
        if (cashRes.data) {
            cashRes.data.forEach(cash => {
                db.cash.push({
                    type: cash.cash_type,
                    val: Number(cash.nominal)
                });
            });
        }

        // Jalankan kalkulator ledger dan gambar ulang ke layar browser
        processLedger();
        save();
        await updatePrices();
        render();
        showToast("Data cloud berhasil disinkronkan!", "success");

    } catch (err) {
        // Meredam eror merah CORS (null) agar tidak mengotori console saat internet berkedip/RTO
        console.log("[Supabase Catch] Koneksi database cloud tertunda karena kendala jaringan. Aplikasi beralih ke cache lokal.");
        
        // Tetap jalankan kalkulator lokal agar data yang sudah ada di layar tidak hilang atau menjadi 0
        try {
            processLedger();
            render();
        } catch (e) {
            console.log("[Fallback Render] Gagal menggambar ulang layar.");
        }
        
        // Memunculkan toast peringatan yang rapi untuk user tanpa memicu eror sistem merah
        if (typeof showToast === "function") {
            showToast("Koneksi tidak stabil, menampilkan data terakhir", "warning");
        }
    }
}

// 2. Fungsi Registrasi Akun Baru
async function handleRegister() {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!name || !email || !password) {
        showToast("Semua kolom registrasi wajib diisi!", "error");
        return;
    }
    if (password.length < 6) {
        showToast("Kata sandi minimal harus 6 karakter!", "error");
        return;
    }

    showToast("Sedang memproses pendaftaran...", "info");

    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name } }
    });

    if (error) {
        showToast("Gagal mendaftar: " + error.message, "error");
    } else {
        showToast("Pendaftaran berhasil! Akun Anda langsung aktif.", "success");
        toggleAuthForm('login');
    }
}

// 3. Fungsi Login Akun
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showToast("Email dan kata sandi tidak boleh kosong!", "error");
        return;
    }

    showToast("Sedang memverifikasi akun...", "info");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        showToast("Gagal masuk: " + error.message, "error");
    } else {
        showToast("Selamat datang kembali! Memuat dasbor...", "success");
        document.getElementById('authPage').classList.add('hidden');
        // Langsung sedot data dari cloud setelah login sukses
        await loadUserDataFromServer();
    }
}

// 4. Cek Status Sesi Otomatis Saat Aplikasi Dibuka
async function checkUserSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        document.getElementById('authPage').classList.add('hidden');
        showToast(`Masuk otomatis sebagai ${session.user.user_metadata.full_name || session.user.email}`, "success");
        // Sedot data milik user ini dari cloud secara real-time
        await loadUserDataFromServer();

        // === TAMBAHAN SAKTI DI SINI ===
        // Setelah data selesai disedot, jika user di HP, paksa arahkan ke mainMenu (6 tombol)
        if (window.innerWidth <= 768) {
            tab('mainMenu');
        } else {
            tab('dashboard');
        }
        // ==============================

    } else {
        document.getElementById('authPage').classList.remove('hidden');
    }
}

checkUserSession();

// ====== LOGIKA PERPINDAHAN TAB HALAMAN (VERSI FIX 100%) ======
function tab(id) { 
    // 1. Sembunyikan SEMUA elemen ber-class 'page'
    document.querySelectorAll('.page').forEach(x => {
        x.classList.add('hidden');
    }); 

    // 2. Paksa halaman Menu Utama (6 tombol) agar hilang total jika sedang membuka sub-menu
    const mainMenuEl = document.getElementById('mainMenu');
    if (mainMenuEl) {
        if (id === 'mainMenu') {
            mainMenuEl.style.setProperty('display', 'block', 'important'); // Tampilkan jika Menu Utama dipilih
        } else {
            mainMenuEl.style.setProperty('display', 'none', 'important');  // Hilangkan total jika sub-menu lain dipilih
        }
    }

    // 3. Tampilkan HANYA halaman target yang dipilih (1x klik langsung jalan!)
    const targetPage = document.getElementById(id);
    if (targetPage) {
        targetPage.classList.remove('hidden'); 
    }

    // Jalankan render history jika masuk ke halaman riwayat
    if (id === 'history') {
        renderHistory();
    }
}

// ====== LOGIKA NAVIGASI MENU UTAMA MOBILE ======
function bukaSubMenu(idHalaman) {
    // Jalankan fungsi tab untuk membuka sub-menu dan menginstruksikan menu utama agar bersembunyi
    tab(idHalaman); 
    
    // Munculkan tombol kembali melayang jika diakses lewat layar HP
    if (window.innerWidth <= 768) {
        document.getElementById('floatingBackButton').classList.remove('hidden');
    }
}

function kembaliKeMenuUtama() {
    // Kembali menampilkan menu utama dan otomatis menyembunyikan sub-menu aktif sebelumnya
    tab('mainMenu');
    document.getElementById('floatingBackButton').classList.add('hidden');
}

// ====== ENGINE UTAMA: MENGHITUNG SALDO & MODAL DARI LEDGER TRANSACTION ======
function processLedger() {
    db.crypto = [];
    db.stocks = [];
    db.metals = [];

    if (!db.transactions) db.transactions = [];

    db.transactions.forEach(t => {
        if (t.category === 'crypto') {
            let asset = db.crypto.find(x => x.id === t.assetId);
            if (!asset) {
                asset = { id: t.assetId, qty: 0, entry: 0, cur: t.cur || 'idr', price: 0 };
                db.crypto.push(asset);
            }
            if (t.type === 'beli') {
                asset.entry += (Number(t.totalModal) || 0); 
                asset.qty += (Number(t.qty) || 0);          
            }
        } 
        else if (t.category === 'stocks') {
            let asset = db.stocks.find(x => x.ticker === t.assetId);
            if (!asset) {
                asset = { ticker: t.assetId, qty: 0, entry: 0, price: 0 };
                db.stocks.push(asset);
            }
            if (t.type === 'beli') {
                let totalLembarBaru = (Number(t.qty) || 0) * 100;
                let totalModalBaru = totalLembarBaru * (Number(t.entryPrice) || 0);
                
                asset.qty += (Number(t.qty) || 0); 
                asset.entry += totalModalBaru; 
            }
        } 
        else if (t.category === 'metals') {
            let asset = db.metals.find(x => x.type === t.assetId);
            if (!asset) {
                asset = { type: t.assetId, gram: 0, entry: 0, price: 0 }; 
                db.metals.push(asset);
            }
            if (t.type === 'beli') {
                asset.gram += (Number(t.qty) || 0); 
                asset.entry += ((Number(t.qty) || 0) * (Number(t.entryPrice) || 0)); 
            }
        }
    });

    db.crypto = db.crypto.filter(x => x.qty > 0);
    db.stocks = db.stocks.filter(x => x.qty > 0);
    db.metals = db.metals.filter(x => x.gram > 0);
}

function setGoal() { 
    const goalInput = document.getElementById('goalInput');
    if (goalInput) {
        db.goal = +goalInput.value; 
        save(); 
        showToast("Target finansial berhasil diperbarui!", "success"); 
    }
}

// ====== CONTROLLER FORM INPUT (INTEGRASI SUPABASE CLOUD) ======

// 1. Fungsi Tambah Aset Crypto ke Cloud Supabase
async function addCrypto() {
    try {
        // Ambil sesi user yang sedang login untuk mendapatkan user_id
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            showToast("Anda harus login terlebih dahulu!", "error");
            return;
        }

        const coinId = document.getElementById('coinId');
        const coinQty = document.getElementById('coinQty');
        const coinEntry = document.getElementById('coinEntry'); 
        const coinCur = document.getElementById('coinCur');
        const coinSearch = document.getElementById('coinSearch');

        if(!coinId || !coinId.value || !coinQty || !coinQty.value || !coinEntry || !coinEntry.value) {
            showToast("Mohon lengkapi semua data Crypto!", "error");
            return;
        }

        showToast("Menyimpan data Crypto ke cloud...", "info");

        // Kirim data langsung ke tabel tb_crypto di Supabase
        const { error } = await supabaseClient
            .from('tb_crypto')
            .insert([{
                user_id: session.user.id, // Kunci RLS gembok data user
                coin_id: coinId.value.toLowerCase(),
                coin_search: coinSearch ? coinSearch.value : '',
                quantity: parseFloat(coinQty.value),
                total_entry: parseFloat(coinEntry.value),
                currency: coinCur.value
            }]);

        if (error) throw error;

        // Reset form input di layar setelah berhasil
        if(coinSearch) coinSearch.value = "";
        coinId.value = "";
        coinQty.value = "";
        coinEntry.value = "";
        
        // Panggil ulang fungsi sinkronisasi agar layar mendownload data terbaru
        await loadUserDataFromServer();
        showToast("Aset Crypto berhasil disimpan ke Cloud!", "success");

    } catch (err) {
        console.error("Gagal menyimpan crypto:", err);
        showToast("Gagal menyimpan data ke cloud: " + err.message, "error");
    }
}

// 2. Fungsi Tambah Aset Saham ke Cloud Supabase
async function addStock() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            showToast("Anda harus login terlebih dahulu!", "error");
            return;
        }

        const stockTicker = document.getElementById('stockTicker');
        const stockQty = document.getElementById('stockQty');
        const stockEntry = document.getElementById('stockEntry');

        if(!stockTicker || !stockTicker.value || !stockQty || !stockQty.value || !stockEntry || !stockEntry.value) {
            showToast("Mohon lengkapi semua data Saham!", "error");
            return;
        }

        let entryRaw = stockEntry.value.toString();
        let entryInput = parseFloat(entryRaw.replace(/\./g, '')); 

        showToast("Menyimpan data Saham ke cloud...", "info");

        // Kirim data langsung ke tabel tb_stocks di Supabase
        const { error } = await supabaseClient
            .from('tb_stocks')
            .insert([{
                user_id: session.user.id,
                ticker: stockTicker.value.toUpperCase().trim(),
                quantity_lot: parseFloat(stockQty.value),
                price_per_share: entryInput
            }]);

        if (error) throw error;

        // Reset form input di layar
        stockTicker.value = "";
        stockQty.value = "";
        stockEntry.value = "";
        
        // Panggil ulang fungsi sinkronisasi agar layar mendownload data terbaru
        await loadUserDataFromServer();
        showToast("Aset Saham berhasil disimpan ke Cloud!", "success");

    } catch (err) {
        console.error("Gagal menyimpan saham:", err);
        showToast("Gagal menyimpan data ke cloud: " + err.message, "error");
    }
}

async function addMetal() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            showToast("Anda harus login terlebih dahulu!", "error");
            return;
        }

        const metalType = document.getElementById('metalType');
        const metalGram = document.getElementById('metalGram');
        const metalEntry = document.getElementById('metalEntry');

        if(!metalType || !metalGram || !metalGram.value || !metalEntry || !metalEntry.value) {
            showToast("Mohon lengkapi semua data Logam Mulia!", "error");
            return;
        }

        showToast("Menyimpan data Logam Mulia ke cloud...", "info");

        const { error } = await supabaseClient
            .from('tb_metals')
            .insert([{
                user_id: session.user.id,
                metal_type: metalType.value,
                weight_gram: parseFloat(metalGram.value),
                price_per_gram: parseFloat(metalEntry.value)
            }]);

        if (error) throw error;

        metalGram.value = "";
        metalEntry.value = "";
        
        await loadUserDataFromServer();
        showToast("Aset Logam Mulia berhasil disimpan ke Cloud!", "success");

    } catch (err) {
        console.error("Gagal menyimpan logam mulia:", err);
        showToast("Gagal menyimpan data ke cloud: " + err.message, "error");
    }
}

async function addCash() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            showToast("Anda harus login terlebih dahulu!", "error");
            return;
        }

        const cashType = document.getElementById('cashType');
        const cashValue = document.getElementById('cashValue');

        if(!cashType || !cashValue || !cashValue.value) return;

        showToast("Memperbarui catatan kas di cloud...", "info");

        const { error } = await supabaseClient
            .from('tb_cash')
            .insert([{
                user_id: session.user.id,
                cash_type: cashType.value,
                nominal: parseFloat(cashValue.value)
            }]);

        if (error) throw error;

        cashValue.value = "";
        
        await loadUserDataFromServer();
        showToast("Catatan modal berhasil diperbarui di Cloud!", "success");

    } catch (err) {
        console.error("Gagal menyimpan data kas:", err);
        showToast("Gagal memperbarui modal: " + err.message, "error");
    }
}

function del(group, i) { 
    db[group].splice(i, 1); 
    save(); 
    showToast("Data kas berhasil dihapus!", "error"); 
}

function edit(group, i) {
    let o = db[group][i];
    for(let k in o){
        if(typeof o[k] === 'number'){ 
            let v = prompt(`Ubah data ${k}:`, o[k]); 
            if(v !== null) o[k] = Number(v);
        }
    }
    save();
}

async function fx() {
    try {
        let r = await fetch('https://api.coingecko.com/api/v3/exchange_rates');
        let d = await r.json();
        if (d.rates && d.rates.idr && d.rates.usd) {
            USDIDR = d.rates.idr.value / d.rates.usd.value;
        }
    } catch (e) {}
}

const coinSearchEl = document.getElementById('coinSearch');
if (coinSearchEl) {
    coinSearchEl.oninput = async () => {
        if(coinSearchEl.value.length < 2) return;
        try {
            let r = await fetch('https://api.coingecko.com/api/v3/search?query=' + coinSearchEl.value);
            let d = await r.json();
            const coinSuggest = document.getElementById('coinSuggest');
            if (coinSuggest) {
                coinSuggest.innerHTML = d.coins.slice(0, 5).map(c => 
                    `<div style="cursor:pointer; padding:8px; background:rgba(255,255,255,0.1); margin:2px; border-radius:6px;" onclick="document.getElementById('coinId').value='${c.id}'; document.getElementById('coinSearch').value='${c.name}'; document.getElementById('coinSuggest').innerHTML='';">${c.name}</div>`
                ).join('');
            }
        } catch (e) {}
    };
}

async function updatePrices() {
    if (db.crypto && db.crypto.length > 0) {
        const coinIds = db.crypto.map(c => c.id).join(',');
        try {
            let r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=idr,usd`);
            let d = await r.json();
            db.crypto.forEach(c => {
                if (d[c.id] && d[c.id][c.cur]) {
                    c.price = d[c.id][c.cur];
                }
            });
        } catch (e) { console.log("Gagal memuat massal harga crypto"); }
    }

// === KODE FINAL: LOGIKA PENJEMPUTAN HARGA SAHAM MENGGUNAKAN CODETABS PROXY ===
    for (const s of db.stocks) {
        let hargaBerhasilDitemukan = false;
        let urlSaham = 'https://query1.finance.yahoo.com/v8/finance/chart/' + s.ticker;

        // --- BLOK PROXY UTAMA (ALLORIGINS) ---
        if (!hargaBerhasilDitemukan) {
            try {
                let r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(urlSaham)}`);
                if (r.ok) {
                    let res = await r.json();
                    if (res && res.contents) {
                        let d = JSON.parse(res.contents);
                        if (d && d.chart && d.chart.result && d.chart.result[0]) {
                            let meta = d.chart.result[0].meta;
                            s.price = meta.regularMarketPrice || meta.chartPreviousClose || s.price;
                            hargaBerhasilDitemukan = true;
                        }
                    }
                }
            } catch (e) {
                console.log(`[Proxy A] AllOrigins sibuk, mengalihkan ${s.ticker} ke jalur cadangan...`);
            }
        }

        // --- BLOK PROXY CADANGAN (CODETABS PROXY) ---
        // Dieksekusi jika AllOrigins return eror 520/522 atau down
        if (!hargaBerhasilDitemukan) {
            try {
                // Menggunakan api.codetabs.com yang lebih ramah terhadap request browser langsung
                let r = await fetch(`https://api.codetabs.com/v1/proxy/?url=${encodeURIComponent(urlSaham)}`);
                if (r.ok) {
                    let d = await r.json(); // Codetabs mengembalikan data mentah langsung tanpa properti .contents
                    if (d && d.chart && d.chart.result && d.chart.result[0]) {
                        let meta = d.chart.result[0].meta;
                        s.price = meta.regularMarketPrice || meta.chartPreviousClose || s.price;
                        hargaBerhasilDitemukan = true;
                    }
                }
            } catch (e) {
                console.log(`[Proxy B] Jalur Codetabs tertunda untuk ${s.ticker}.`);
            }
        }

        // --- PENGAMAN AKHIR (FALLBACK DATA) ---
        if (!hargaBerhasilDitemukan && (!s.price || s.price === 0)) {
            s.price = s.price || 0; 
            console.log(`[Fallback System] Mempertahankan harga terakhir di database untuk ${s.ticker}.`);
        }
    }

    for (const m of db.metals) {
        try {
            let url = m.type === 'gold' ? 'https://api.gold-api.com/price/XAU' : 'https://api.gold-api.com/price/XAG';
            let r = await fetch(url);
            let d = await r.json();
            if (d.price) {
                m.price = (d.price / 31.1035) * USDIDR;
            }
        } catch (e) {
            console.log("Gagal memuat harga logam mulia");
        }
    }
    localStorage.setItem('fosv10', JSON.stringify(db)); 
}

// ====== GENERATOR RENDER UI ======
function render() {
    let total = 0, modal = 0, alloc = { crypto: 0, stocks: 0, metals: 0 };

    const cryptoList = document.getElementById('cryptoList');
    if (cryptoList) {
        cryptoList.innerHTML = db.crypto.map((x, i) => {
            let hargaSekarang = x.price || 0;
            let valueRaw = x.qty * hargaSekarang;
            let idrVal = x.cur === 'usd' ? valueRaw * USDIDR : valueRaw;
            
            alloc.crypto += idrVal; 
            total += idrVal;
            
            let totalModalInput = x.entry || 0;
            let modalBeliIdr = x.cur === 'usd' ? totalModalInput * USDIDR : totalModalInput;
            
            let pnlIdr = idrVal - modalBeliIdr;
            let pnlPct = modalBeliIdr > 0 ? (pnlIdr / modalBeliIdr) * 100 : 0;
            let avgBuyPrice = x.qty > 0 ? (totalModalInput / x.qty) : 0;

            return `<div class="item">
                <b>${x.id.toUpperCase()}</b><br>
                <div style="font-size:13px; margin:5px 0; color:#d1d5db; line-height: 1.5;">
                    • Qty Koin: <b>${x.qty}</b><br>
                    • Harga Beli Rata²: <b>${x.cur==='usd'?'$':''}${avgBuyPrice.toLocaleString('id-ID')} ${x.cur.toUpperCase()}</b><br>
                    • Harga Sekarang: <b>${x.cur==='usd'?'$':''}${hargaSekarang.toLocaleString('id-ID')} ${x.cur.toUpperCase()}</b><br>
                    • Total Value: <b>${idr(idrVal)}</b><br>
                    • Profit/Loss: <span class="${pnlIdr >= 0 ? 'green' : 'red'}">${idr(pnlIdr)} (${pnlPct.toFixed(2)}%)</span>
                </div>
            </div>`;
        }).join('');
    }

    const stockList = document.getElementById('stockList');
    if (stockList) {
        stockList.innerHTML = db.stocks.map((x, i) => {
            let totalLembar = (x.qty || 0) * 100; 
            let valRaw = totalLembar * (x.price || 0);
            let isUsStock = !x.ticker.endsWith('.JK');
            let valIdr = isUsStock ? valRaw * USDIDR : valRaw;
            
            alloc.stocks += valIdr; 
            total += valIdr;

            let modalBeliIdr = x.entry || 0; 
            let avgBuyPrice = totalLembar > 0 ? (modalBeliIdr / totalLembar) : 0;

            let pnlIdr = valIdr - modalBeliIdr;
            let pnlPct = modalBeliIdr > 0 ? (pnlIdr / modalBeliIdr) * 100 : 0;

            return `<div class="item">
                <b>${x.ticker}</b><br>
                <div style="font-size:13px; margin:5px 0; color:#d1d5db; line-height: 1.5;">
                    • Jumlah Lot: <b>${x.qty} Lot</b> (${totalLembar} lbr)<br>
                    • Harga Beli Rata²/lbr: <b>${isUsStock?'$':''}${avgBuyPrice.toLocaleString('id-ID')} ${isUsStock?'USD':'IDR'}</b><br>
                    • Harga Sekarang: <b>${isUsStock?'$':''}${(x.price || 0).toLocaleString('id-ID')} ${isUsStock?'USD':'IDR'}</b><br>
                    • Total Value: <b>${idr(valIdr)}</b><br>
                    • Profit/Loss: <span class="${pnlIdr >= 0 ? 'green' : 'red'}">${idr(pnlIdr)} (${pnlPct.toFixed(2)}%)</span>
                </div>
            </div>`;
        }).join('');
    }

    const metalList = document.getElementById('metalList');
    if (metalList) {
        metalList.innerHTML = db.metals.map((x, i) => {
            let val = (x.gram || 0) * (x.price || 0);
            alloc.metals += val; 
            total += val;
            
            let totalModalBeli = x.entry || 0; 
            let avgBuyPrice = x.gram > 0 ? (totalModalBeli / x.gram) : 0;

            let pnlIdr = val - totalModalBeli;
            let pnlPct = totalModalBeli > 0 ? (pnlIdr / totalModalBeli) * 100 : 0;
            let namaLogam = x.type === 'gold' ? 'EMAS (GOLD)' : 'PERAK (SILVER)';

            return `<div class="item">
                <b>${namaLogam}</b><br>
                <div style="font-size:13px; margin:5px 0; color:#d1d5db; line-height: 1.5;">
                    • Berat Bersih: <b>${x.gram} Gram</b><br>
                    • Harga Beli Rata²/gram: <b>${idr(avgBuyPrice)}</b><br>
                    • Harga Sekarang/gram: <b>${idr(x.price || 0)}</b><br>
                    • Total Value: <b>${idr(val)}</b><br>
                    • Profit/Loss: <span class="${pnlIdr >= 0 ? 'green' : 'red'}">${idr(pnlIdr)} (${pnlPct.toFixed(2)}%)</span>
                </div>
            </div>`;
        }).join('');
    }

    const cashList = document.getElementById('cashList');
    if (cashList) {
        cashList.innerHTML = db.cash.map((x, i) => {
            modal += x.type === 'in' ? x.val : -x.val;
            return `<div class="item">
                ${x.type === 'in' ? '🔵 Modal Masuk' : '🔴 Modal Keluar'} <b>${idr(x.val)}</b>
                <button style="width:auto; padding:2px 8px; background:#dc2626; color:white; margin-left:10px;" onclick="del('cash',${i})">Hapus</button>
            </div>`;
        }).join('');
    }

    const totalAssetEl = document.getElementById('totalAsset');
    const netCashEl = document.getElementById('netCash');
    const goalPctEl = document.getElementById('goalPct');
    const barEl = document.getElementById('bar');

    let currentAssetVal = totalAssetEl ? parseFloat(totalAssetEl.innerText.replace(/[^0-9,-]/g, '').replace(',', '.')) || 0 : 0;
    let currentCashVal = netCashEl ? parseFloat(netCashEl.innerText.replace(/[^0-9,-]/g, '').replace(',', '.')) || 0 : 0;

    animateCount(totalAssetEl, currentAssetVal, total, 1000, true);
    animateCount(netCashEl, currentCashVal, modal, 1000, true);

    let pct = db.goal ? Math.min(100, total / db.goal * 100) : 0;
    if (goalPctEl) {
        let currentPctVal = parseFloat(goalPctEl.innerText) || 0;
        animateCount(goalPctEl, currentPctVal, pct, 1000, false);
    }
    if (barEl) barEl.style.width = pct + '%';

    drawCharts(total, alloc);
}

function renderHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!db.transactions || db.transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #9ca3af; padding: 30px;">Belum ada riwayat transaksi yang dicatat.</td></tr>`;
        return;
    }

    const sortedTx = [...db.transactions].sort((a, b) => b.id - a.id);

    sortedTx.forEach(t => {
        const tr = document.createElement('tr');
        tr.style.cssText = "border-bottom: 1px solid rgba(255,255,255,0.05); color: #e5e7eb;";
        
        let totalNilaiTampil = 0;
        let formattedAssetId = (t.assetId || '').toUpperCase();
        let formattedPrice = idr(t.entryPrice);
        let formattedQty = t.qty;

        if (t.category === 'crypto') {
            let totalHargaRaw = (t.qty || 0) * (t.entryPrice || 0);
            formattedPrice = t.cur === 'usd' ? '$' + (t.entryPrice || 0).toLocaleString('id-ID') : idr(t.entryPrice);
            totalNilaiTampil = t.cur === 'usd' ? '$' + totalHargaRaw.toLocaleString('id-ID') : idr(totalHargaRaw);
        } else if (t.category === 'stocks') {
            totalNilaiTampil = idr((t.qty || 0) * 100 * (t.entryPrice || 0)); 
            formattedQty = `${t.qty} Lot`;
        } else if (t.category === 'metals') {
            totalNilaiTampil = idr((t.qty || 0) * (t.entryPrice || 0));
            formattedQty = `${t.qty} Gram`;
            formattedAssetId = t.assetId === 'gold' ? 'EMAS (GOLD)' : 'PERAK (SILVER)';
        }

        tr.innerHTML = `
            <td style="padding: 12px;">${t.date || '-'}</td>
            <td style="padding: 12px; text-transform: uppercase; font-size: 12px; color: #9ca3af;">${t.category}</td>
            <td style="padding: 12px; font-weight: bold; color: #3b82f6;">${formattedAssetId}</td>
            <td style="padding: 12px;"><span style="padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: rgba(34,197,94,0.2); color: #22c55e;">${t.type.toUpperCase()}</span></td>
            <td style="padding: 12px;">${formattedQty}</td>
            <td style="padding: 12px;">${formattedPrice}</td>
            <td style="padding: 12px; font-weight: bold;">${totalNilaiTampil}</td>
            <td style="padding: 12px;"><button style="width:auto; padding:3px 8px; background:#dc2626; color:white; border:none; border-radius:6px; cursor:pointer;" onclick="deleteTransaction(${t.id})">Hapus</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteTransaction(txId) {
    if (confirm("Apakah Anda yakin ingin menghapus catatan transaksi ini? Saldo portofolio akan dihitung ulang secara otomatis.")) {
        try {
            showToast("Menghapus data dari cloud...", "info");

            await Promise.all([
                supabaseClient.from('tb_crypto').delete().eq('id', txId),
                supabaseClient.from('tb_stocks').delete().eq('id', txId),
                supabaseClient.from('tb_metals').delete().eq('id', txId)
            ]);

            await loadUserDataFromServer();
            showToast("Catatan transaksi berhasil dihapus dari Cloud!", "error");

        } catch (err) {
            console.error("Gagal menghapus transaksi:", err);
            showToast("Gagal menghapus data dari cloud", "error");
        }
    }
}

function drawCharts(total, alloc) {
    const pieEl = document.getElementById('pie');
    if (pieEl) {
        if (pie) pie.destroy();
        pie = new Chart(pieEl, {
            type: 'pie',
            data: {
                labels: Object.keys(alloc).map(k => k.toUpperCase()),
                datasets: [{ data: Object.values(alloc), backgroundColor: ['#3b82f6', '#ec4899', '#f59e0b'] }]
            },
            options: { plugins: { legend: { labels: { color: 'white' } } } }
        });
    }

    const equityEl = document.getElementById('equity');
    if (equityEl) {
        let waktuSekarang = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        if (!db.equity) db.equity = [];
        if (!db.equityLabels) db.equityLabels = [];
        
        let punyaTransaksi = db.transactions && db.transactions.length > 0;
        let punyaModal = db.cash && db.cash.length > 0;
        let userSudahPunyaAset = punyaTransaksi || punyaModal;

        if (total > 0 || !userSudahPunyaAset) {
            if (db.equity.length === 0 || db.equityLabels[db.equityLabels.length - 1] !== waktuSekarang) {
                db.equity.push(total);
                db.equityLabels.push(waktuSekarang);
                if (db.equity.length > 25) {
                    db.equity.shift();       // Hapus titik ekuitas paling tua (paling kiri)
                    db.equityLabels.shift(); // Hapus label waktu paling tua (paling kiri)
                }
                localStorage.setItem('fosv10', JSON.stringify(db)); 
            }
        }

        if (equity) equity.destroy();
        equity = new Chart(equityEl, {
            type: 'line',
            data: {
                labels: db.equityLabels,
                datasets: [{
                    label: 'Pertumbuhan Portofolio (IDR)',
                    data: db.equity,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.2
                }]
            },
            options: {
                plugins: { legend: { labels: { color: 'white' } } },
                scales: {
                    x: { 
                        ticks: { color: 'white' } 
                    },
                    y: { 
                        ticks: { 
                            color: 'white',
                            stepSize: 500000, 
                            callback: function(value) {
                                return value.toLocaleString('id-ID');
                            }
                        } 
                    }
                }
            }
        });
    }
}

// 🟢 FUNGSI UNTUK MENYIMPAN SNAPSHOT EKUITAS HARIAN MANUAl
function snapshotEquity() {
    // 1. Ambil nilai total aset saat ini yang ada di layar
    const totalAssetEl = document.getElementById('totalAsset');
    if (!totalAssetEl) return;
    
    // Konversi teks Rp dari layar menjadi angka murni JavaScript
    let totalSekarang = parseFloat(totalAssetEl.innerText.replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;
    
    if (totalSekarang <= 0) {
        showToast("Gagal mengambil snapshot! Saldo masih Rp0 atau belum termuat.", "error");
        return;
    }

    // 2. Ambil tanggal hari ini (Format: DD/MM/YYYY)
    let tanggalHariIni = new Date().toLocaleDateString('id-ID');

    if (!db.equity) db.equity = [];
    if (!db.equityLabels) db.equityLabels = [];

    // 3. Cek apakah hari ini sudah pernah simpan snapshot atau belum
    let indeksHariIni = db.equityLabels.indexOf(tanggalHariIni);

    if (indeksHariIni !== -1) {
        // Jika hari ini sudah pernah klik, perbarui saja angkanya dengan yang paling baru
        db.equity[indeksHariIni] = totalSekarang;
        showToast("Snapshot hari ini berhasil diperbarui!", "success");
    } else {
        // Jika benar-benar hari baru, tambahkan titik koordinat baru di grafik
        db.equity.push(totalSekarang);
        db.equityLabels.push(tanggalHariIni);
        showToast("Snapshot harian berhasil disimpan secara permanen!", "success");
    }

    // 4. Simpan ke LocalStorage dan gambar ulang grafiknya
    localStorage.setItem('fosv10', JSON.stringify(db));
    render();
}

// === TAHAP 3: OPTIMASI TIMER BACKGROUND REFRESH CERDAS ===
setInterval(async () => {
    // Cek apakah tab browser sedang aktif dibuka oleh user
    // Jika user sedang membuka tab lain, hentikan request sementara (menghemat RAM & internet)
    if (document.hidden) {
        console.log("[Timer Paused] Menghemat resource karena tab sedang tidak aktif.");
        return; 
    }

    console.log("Memulai pembaruan harga otomatis di latar belakang...");
    
    // Pastikan user sedang dalam kondisi online/terhubung internet
    if (navigator.onLine) {
        try {
            await updatePrices(); // Ambil harga terbaru dari internet (dengan dual proxy Tahap 2)
            render();             // Gambar ulang angka baru ke layar secara otomatis
            console.log("Layar berhasil diperbarui secara otomatis!");
        } catch (error) {
            console.log("[Timer Catch] Pembaruan terjeda akibat kendala jaringan.");
        }
    } else {
        console.log("[Timer Offline] Koneksi internet terputus, menunda pembaruan.");
    }
}, 30000); // Berjalan stabil setiap 30 detik 

// Jalankan pembaruan kurs USD setiap 1 menit
setInterval(async () => {
    await fx();
    render();
}, 60000);

async function init() {
    try {
        console.log("Menginisialisasi aplikasi...");
        
        // 1. Ambil data user dari server terlebih dahulu (Prioritas Utama)
        await loadUserDataFromServer(); 
        render();

        // 2. TAHAP 1: Berikan jeda 2 detik sebelum menembak API harga saham live
        // Ini agar browser tidak overload di detik pertama refresh
        setTimeout(async () => {
            if (navigator.onLine) {
                console.log("[Init Delay] Mengambil data harga live setelah jeda pengaman...");
                await updatePrices();
                render();
            }
        }, 2000); // Jeda 2000 milidetik (2 detik)

    } catch (error) {
        console.error("Gagal melakukan inisialisasi aplikasi:", error);
    }
}

function animateCount(element, start, end, duration, isCurrency = true) {
    if (!element) return;
    let startTime = null;

    function animation(currentTime) {
        if (!startTime) startTime = currentTime;
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const currentValue = start + progress * (end - start);
        
        if (isCurrency) {
            element.innerText = idr(currentValue);
        } else {
            element.innerText = currentValue.toFixed(1) + '% (Target: ' + idr(db.goal) + ')';
        }

        if (progress < 1) {
            requestAnimationFrame(animation);
        }
    }
    requestAnimationFrame(animation);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => { toast.remove(); }, 300);
    }, 3000);
}

// Fungsi untuk membuka sub-menu dari menu utama HP
function bukaSubMenu(idHalaman) {
    tab(idHalaman); // Memanggil fungsi tab asli bawaan kodinganmu
    
    // Jika diakses lewat HP, munculkan tombol back melayang
    if (window.innerWidth <= 768) {
        document.getElementById('floatingBackButton').classList.remove('hidden');
    }
}

// Fungsi untuk kembali ke menu utama kotak-kotak di HP
function kembaliKeMenuUtama() {
    tab('mainMenu');
    document.getElementById('floatingBackButton').classList.add('hidden');
}