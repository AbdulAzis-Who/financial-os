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

// --- STATE KENDALIAN TERMINAL LOGIN CLI ---
let authStep = "command"; // Status gerbang: "command" atau "password"
let tempEmail = "";       // Penampung email sementara saat handshake jaringan

// Variabel instance Chart agar tidak bertabrakan global
let liveEquityChartInstance = null;
let historicalEquityChartInstance = null;

if (!db.liveTicks) db.liveTicks = [];

const idr = x => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(x || 0);

function save() { 
    localStorage.setItem('fosv10', JSON.stringify(db)); 
    render(); 
}

// ==================== 🕹️ ENGINE INTELIJEN TERMINAL CLI LOGIN ====================

// Inisialisasi Event Listener Keyboard Terminal saat DOM selesai dimuat
document.addEventListener("DOMContentLoaded", () => {
    const termInput = document.getElementById("terminalInput");
    if (termInput) {
        termInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                const value = this.value.trim();
                if (value) {
                    executeTerminalLogin(value);
                    this.value = ""; // Bersihkan baris input setelah Enter
                }
            }
        });
        
        // Jaga agar focus tetap berada di input terminal jika user tidak sengaja klik luar area
        document.addEventListener("click", () => {
            const authPage = document.getElementById("authPage");
            if (authPage && !authPage.classList.contains("hidden")) {
                termInput.focus();
            }
        });
    }
});

async function executeTerminalLogin(input) {
    const historyContainer = document.getElementById("terminalHistory");
    if (!historyContainer) return;

    // 1. MODUL STATUS JALUR PASSWORD (ENTRI SANDI SECARA STEALTH)
    if (authStep === "password") {
        // Tampilkan bintang samaran di layar agar password tidak terekspos murni
        const maskedPassword = "*".repeat(input.length);
        historyContainer.innerHTML += `<div class="line"><span class="prompt">guest@fos_terminal:~$</span> enter password: ${maskedPassword}</div>`;
        historyContainer.innerHTML += `<div class="line text-yellow">[PING] Handshaking with Supabase Singapore node via SSL...</div>`;
        historyContainer.scrollTop = historyContainer.scrollHeight;

        try {
            // Tembak autentikasi cloud langsung ke Supabase API
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: tempEmail,
                password: input
            });

            if (error) {
                historyContainer.innerHTML += `<div class="line text-red">[AUTH_ERROR] Login rejected: ${error.message}</div>`;
                historyContainer.innerHTML += `<div class="line text-blue">[SYSTEM] Type 'login <email>' or 'register' to retry.</div>`;
                authStep = "command";
                tempEmail = "";
            } else {
                historyContainer.innerHTML += `<div class="line text-green">[SUCCESS] Access Granted! Deploying Financial OS environment...</div>`;
                historyContainer.scrollTop = historyContainer.scrollHeight;
                
                setTimeout(async () => {
                    document.getElementById("authPage").classList.add("hidden");
                    // Sedot data segar cloud secara real-time
                    await loadUserDataFromServer();
                }, 1200);
            }
        } catch (err) {
            historyContainer.innerHTML += `<div class="line text-red">[FATAL] Connection timeout. Try again.</div>`;
            authStep = "command";
        }
        historyContainer.scrollTop = historyContainer.scrollHeight;
        return;
    }

    // 2. MODUL PARSING KATA PERINTAH (COMMAND LINE INTERPRETER)
    historyContainer.innerHTML += `<div class="line"><span class="prompt">guest@fos_terminal:~$</span> ${input}</div>`;
    const parts = input.split(" ");
    const cmd = parts[0].toLowerCase();

    if (cmd === "clear" || cmd === "cls") {
        historyContainer.innerHTML = `
            <div class="line text-blue">==================================================</div>
            <div class="line text-blue">      FINANCIAL OS [Version 1.0.0] - CLI CORE       </div>
            <div class="line text-blue">==================================================</div>
            <div class="line">Type <span class="text-yellow">login [your_email]</span> to authenticate.</div>
            <div class="line">Type <span class="text-yellow">register</span> to generate a new account node.</div>
            <div class="line">Type <span class="text-yellow">help</span> to list terminal protocols.</div>
            <div class="line">&nbsp;</div>
        `;
    } 
    else if (cmd === "help") {
        historyContainer.innerHTML += `
            <div class="line text-yellow">Available Security Protocols:</div>
            <div class="line"> • <span class="text-blue">login [email]</span>  : Initiates cloud synchronization chain</div>
            <div class="line"> • <span class="text-blue">register</span>       : Allocates a new encrypted profile on Supabase</div>
            <div class="line"> • <span class="text-blue">clear / cls</span>    : Flushes terminal screen logs</div>
            <div class="line"> • <span class="text-blue">sysinfo</span>       : Displays core engine build and network data</div>
        `;
    } 
    else if (cmd === "sysinfo") {
        historyContainer.innerHTML += `
            <div class="line">--------------------------------------------------</div>
            <div class="line">OS Core Version : Financial OS v1.0.0 Stable Build</div>
            <div class="line">Subsystem Engine: Debian CLI Base Mode</div>
            <div class="line">Cloud Provider  : Supabase Cloud (Singapore Regions)</div>
            <div class="line">Network Protocol: HTTPS / SSL TLS v1.3 Secured</div>
            <div class="line">Status Gateway  : ONLINE (Client Connected)</div>
            <div class="line">--------------------------------------------------</div>
        `;
    } 
    else if (cmd === "login") {
        if (!parts[1]) {
            historyContainer.innerHTML += `<div class="line text-red">[ERR] Syntax invalid. Usage: login your_email@domain.com</div>`;
        } else {
            tempEmail = parts[1];
            authStep = "password";
            historyContainer.innerHTML += `<div class="line text-blue">[SYSTEM] Target account verified: ${tempEmail}</div>`;
            historyContainer.innerHTML += `<div class="line">Please enter account decryption password below.</div>`;
        }
    } 
    else if (cmd === "register") {
        const name = prompt("Enter your Full Name for cloud node identity:");
        const email = prompt("Enter your Email Address for account database alignment:");
        const password = prompt("Enter secure Password (min 6 characters):");

        if (!name || !email || !password) {
            historyContainer.innerHTML += `<div class="line text-red">[ERR] Operation aborted. All registration payloads are mandatory.</div>`;
        } else if (password.length < 6) {
            historyContainer.innerHTML += `<div class="line text-red">[ERR] Operational failure. Password strength must be >= 6 characters.</div>`;
        } else {
            historyContainer.innerHTML += `<div class="line text-yellow">[INJECTING] Dispatching database node record request to cloud...</div>`;
            try {
                const { data, error } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: { data: { full_name: name } }
                });

                if (error) {
                    historyContainer.innerHTML += `<div class="line text-red">[REG_FAILED] Supabase rejected entity: ${error.message}</div>`;
                } else {
                    historyContainer.innerHTML += `<div class="line text-green">[SUCCESS] Account registration deployment complete! Node activated.</div>`;
                    historyContainer.innerHTML += `<div class="line text-blue">[SYSTEM] You can now proceed to type 'login ${email}'</div>`;
                }
            } catch (err) {
                historyContainer.innerHTML += `<div class="line text-red">[FATAL] Jaringan terputus dari server master.</div>`;
            }
        }
    } 
    else {
        historyContainer.innerHTML += `<div class="line text-red">bash: command not found: ${cmd}. Type 'help' for terminal instructions.</div>`;
    }
    historyContainer.scrollTop = historyContainer.scrollHeight;
}

// ==================== 🕹️ FUNGSI AUTHENTICATION & SYNC (CLOUD) ====================

// Fungsi Ambil Data dari Server Supabase Terpusat (PULL DATA)
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
        await loadEquityHistory();

    } catch (err) {
        console.log("[Supabase Catch] Koneksi database cloud tertunda karena kendala jaringan. Aplikasi beralih ke cache lokal.");
        try {
            processLedger();
            render();
        } catch (e) {
            console.log("[Fallback Render] Gagal menggambar ulang layar.");
        }
        if (typeof showToast === "function") {
            showToast("Koneksi tidak stabil, menampilkan data terakhir", "warning");
        }
    }
}

// Cek Status Sesi Otomatis Saat Aplikasi Dibuka
async function checkUserSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        document.getElementById('authPage').classList.add('hidden');
        showToast(`Masuk otomatis sebagai ${session.user.user_metadata.full_name || session.user.email}`, "success");
        await loadUserDataFromServer();

        // Jika user menggunakan HP, paksa arahkan langsung ke mainMenu
        if (window.innerWidth <= 768) {
            tab('mainMenu');
        } else {
            tab('dashboard');
        }

    } else {
        document.getElementById('authPage').classList.remove('hidden');
    }
}

checkUserSession();

// ====== LOGIKA PERPINDAHAN TAB HALAMAN ======
function tab(id) { 
    document.querySelectorAll('.page').forEach(x => {
        x.classList.add('hidden');
    }); 

    const mainMenuEl = document.getElementById('mainMenu');
    if (mainMenuEl) {
        if (id === 'mainMenu') {
            mainMenuEl.style.setProperty('display', 'block', 'important');
        } else {
            mainMenuEl.style.setProperty('display', 'none', 'important');
        }
    }

    const targetPage = document.getElementById(id);
    if (targetPage) {
        targetPage.classList.remove('hidden'); 
    }

    if (id === 'history') {
        renderHistory();
    }
}

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

async function addCrypto() {
    try {
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

        const { error } = await supabaseClient
            .from('tb_crypto')
            .insert([{
                user_id: session.user.id,
                coin_id: coinId.value.toLowerCase(),
                coin_search: coinSearch ? coinSearch.value : '',
                quantity: parseFloat(coinQty.value),
                total_entry: parseFloat(coinEntry.value),
                currency: coinCur.value
            }]);

        if (error) throw error;

        if(coinSearch) coinSearch.value = "";
        coinId.value = "";
        coinQty.value = "";
        coinEntry.value = "";
        
        await loadUserDataFromServer();
        showToast("Aset Crypto berhasil disimpan ke Cloud!", "success");

    } catch (err) {
        console.error("Gagal menyimpan crypto:", err);
        showToast("Gagal menyimpan data ke cloud: " + err.message, "error");
    }
}

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

        const { error } = await supabaseClient
            .from('tb_stocks')
            .insert([{
                user_id: session.user.id,
                ticker: stockTicker.value.toUpperCase().trim(),
                quantity_lot: parseFloat(stockQty.value),
                price_per_share: entryInput
            }]);

        if (error) throw error;

        stockTicker.value = "";
        stockQty.value = "";
        stockEntry.value = "";
        
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

    for (const s of db.stocks) {
        let hargaBerhasilDitemukan = false;
        let urlSaham = 'https://query1.finance.yahoo.com/v8/finance/chart/' + s.ticker;

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

        if (!hargaBerhasilDitemukan) {
            try {
                let r = await fetch(`https://api.codetabs.com/v1/proxy/?url=${encodeURIComponent(urlSaham)}`);
                if (r.ok) {
                    let d = await r.json();
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

    // Jika layar login terminal sedang aktif, batalkan eksekusi kelanjutan render komponen dalam
    const authPage = document.getElementById('authPage');
    if (authPage && !authPage.classList.contains('hidden')) {
        return; 
    }

    try {
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

        if (totalAssetEl) animateCount(totalAssetEl, currentAssetVal, total, 1000, true);

        const mobileTotalAssetEl = document.getElementById('mobileTotalAsset');
        if (mobileTotalAssetEl && totalAssetEl) animateCount(mobileTotalAssetEl, currentAssetVal, total, 1000, true);

        if (netCashEl) animateCount(netCashEl, currentCashVal, modal, 1000, true);

        let pct = db.goal ? Math.min(100, total / db.goal * 100) : 0;
        if (goalPctEl) {
            let currentPctVal = parseFloat(goalPctEl.innerText) || 0;
            animateCount(goalPctEl, currentPctVal, pct, 1000, false);
        }
        if (barEl) barEl.style.width = pct + '%';

        drawCharts(total, alloc);

    } catch (error) {
        console.error("Sistem mendeteksi error pada kalkulasi:", error.message);
    }
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
                    db.equity.shift();       
                    db.equityLabels.shift(); 
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
                    x: { ticks: { color: 'white' } },
                    y: { 
                        ticks: { 
                            color: 'white',
                            stepSize: 500000, 
                            callback: function(value) { return value.toLocaleString('id-ID'); }
                        } 
                    }
                }
            }
        });
    }
}

// ==================== 📈 LOGIKA SNAPSHOT & GRAFIK EKUITAS ====================

async function snapshotEquity() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            showToast("Anda harus login terlebih dahulu!", "error");
            return;
        }

        let totalCurrentAsset = 0;
        db.crypto.forEach(c => {
            let val = c.qty * (c.price || 0);
            totalCurrentAsset += c.cur === 'usd' ? val * USDIDR : val;
        });
        db.stocks.forEach(s => {
            let val = (s.qty * 100) * (s.price || 0);
            totalCurrentAsset += !s.ticker.endsWith('.JK') ? val * USDIDR : val;
        });
        db.metals.forEach(m => {
            totalCurrentAsset += m.gram * (m.price || 0);
        });

        if (totalCurrentAsset <= 0) {
            showToast("Total aset Rp0, tidak ada data untuk disimpan.", "warning");
            return;
        }

        showToast("Menyimpan snapshot ekuitas ke cloud...", "info");

        const { error } = await supabaseClient
            .from('tb_equity')
            .insert([{
                user_id: session.user.id,
                total_asset: totalCurrentAsset
            }]);

        if (error) throw error;

        db.liveTicks = [];
        showToast("Snapshot kekayaan berhasil direkam!", "success");
        await loadEquityHistory();

    } catch (err) {
        console.error("Gagal menyimpan snapshot ekuitas:", err);
        showToast("Gagal menyimpan snapshot: " + err.message, "error");
    }
}

async function loadEquityHistory() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { data, error } = await supabaseClient
            .from('tb_equity')
            .select('total_asset, created_at')
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
            db.equity = data.map(item => Number(item.total_asset));
            db.equityLabels = data.map(item => {
                let dateObj = new Date(item.created_at);
                return dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
            });
        } else {
            db.equity = [];
            db.equityLabels = [];
        }

        updateHistoricalEquityChart();

    } catch (err) {
        console.log("[Equity History Fetch] Gagal memuat tren grafik:", err.message);
    }
}

function updateLiveEquityChart() {
    const ctx = document.getElementById('liveEquityCanvas');
    if (!ctx) return;

    let totalCurrentAsset = 0;
    db.crypto.forEach(c => { totalCurrentAsset += (c.qty * (c.price || 0)) * (c.cur === 'usd' ? USDIDR : 1); });
    db.stocks.forEach(s => { totalCurrentAsset += ((s.qty * 100) * (s.price || 0)) * (!s.ticker.endsWith('.JK') ? USDIDR : 1); });
    db.metals.forEach(m => { totalCurrentAsset += m.gram * (m.price || 0); });

    if (totalCurrentAsset > 0) {
        const waktu = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        db.liveTicks.push({ label: waktu, value: totalCurrentAsset });

        if (db.liveTicks.length > 20) {
            db.liveTicks.shift();
        }
    }

    const labels = db.liveTicks.map(t => t.label).length > 0 ? db.liveTicks.map(t => t.label) : ['Menunggu Data'];
    const dataPoints = db.liveTicks.map(t => t.value).length > 0 ? db.liveTicks.map(t => t.value) : [0];

    if (liveEquityChartInstance) { liveEquityChartInstance.destroy(); }

    liveEquityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Live IDR',
                data: dataPoints,
                borderColor: '#f59e0b', 
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: '#9ca3af', font: { size: 9 } } },
                y: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: '#9ca3af', font: { size: 9 } } }
            }
        }
    });
}

function updateHistoricalEquityChart() {
    const ctx = document.getElementById('historicalEquityCanvas');
    if (!ctx) return;

    const labels = db.equityLabels.length > 0 ? db.equityLabels : ['Belum Ada Snapshot'];
    const dataPoints = db.equity.length > 0 ? db.equity : [0];

    if (historicalEquityChartInstance) { historicalEquityChartInstance.destroy(); }

    historicalEquityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jurnal Kekayaan (IDR)',
                data: dataPoints,
                borderColor: '#3b82f6', 
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                borderWidth: 3,
                fill: true,
                tension: 0.1, 
                pointBackgroundColor: '#2563eb',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: '#9ca3af' } },
                y: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: '#9ca3af' } }
            }
        }
    });
}

// ==================== ⏳ TIMERS BACKGROUND SYSTEM ====================

setInterval(async () => {
    if (document.hidden) return; 

    const authPage = document.getElementById('authPage');
    if (authPage && !authPage.classList.contains('hidden')) return;

    if (navigator.onLine) {
        try {
            await updatePrices();     
            render();                 
            updateLiveEquityChart();  
        } catch (error) {
            console.log("[Timer Catch] Pembaruan terjeda akibat kendala jaringan:", error.message);
        }
    }
}, 30000); 

setInterval(async () => {
    if (!document.hidden && navigator.onLine) {
        const authPage = document.getElementById('authPage');
        if (authPage && authPage.classList.contains('hidden')) {
            await fx();
            render();
        }
    }
}, 60000);

async function init() {
    try {
        await loadUserDataFromServer(); 
        render();

        setTimeout(async () => {
            if (navigator.onLine) {
                await updatePrices();
                render();
            }
        }, 2000); 

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

// ==================== 🍞 LOGIKA SMART TOAST PREMIUM ====================
function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    if (container.children.length >= 3) {
        container.children[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    
    let icon = "💡";
    if (type === "success") icon = "✅";
    if (type === "warning") icon = "⚠️";
    if (type === "error") icon = "❌";

    toast.innerHTML = `<span style="margin-right: 8px;">${icon}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('slide-out');
        toast.addEventListener('animationend', () => { toast.remove(); });
    }, 3000);
}

function bukaSubMenu(idHalaman) {
    tab(idHalaman); 
    if (window.innerWidth <= 768) {
        document.getElementById('floatingBackButton').classList.remove('hidden');
    }
}

function kembaliKeMenuUtama() {
    tab('mainMenu');
    document.getElementById('floatingBackButton').classList.add('hidden');
}

async function handleLogout() {
    const konfirmasi = confirm("Apakah kamu yakin ingin keluar dari aplikasi Financial OS?");
    if (!konfirmasi) return;

    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;

        alert("Berhasil keluar akun. Sampai jumpa kembali!");
        window.location.reload();
        
    } catch (error) {
        alert(`Gagal keluar: ${error.message}`);
    }
}