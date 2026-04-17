// --- Constants ---
const GRAVITY = 0.8;
const JUMP_FORCE = -21.5;
const WALK_SPEED = 7.0;
const GROUND_OFFSET = 100;
const MAX_LIVES = 3;
const MP_MAX = 100;
const ASSIST_COST = 50;
const QUESTIONS_PER_LEVEL = 10;
const ENEMY_ALERT_DIST = 500;
const MAX_OBSTACLE_HEIGHT = 220;
const MAX_VERTICAL_GAP = 180;
const PASSING_PERCENT = 60;

// --- Coyote Time & Jump Buffer Constants ---
const COYOTE_FRAMES = 8;     // ~133ms at 60fps: grace period after leaving ground
const JUMP_BUFFER_FRAMES = 7; // ~117ms: queue jump if pressed just before landing

// --- Centralized Input State (Issue 2 fix) ---
const input = {
    left: false,
    right: false,
    jump: false
};
let inputListenersAttached = false; // prevent duplicate listeners

// --- SCORM 1.2 Integration ---
let scormConnected = false;
let scorm = typeof pipwerks !== 'undefined' ? pipwerks.SCORM : null;

window.addEventListener('load', () => {
    if (scorm) {
        scorm.version = "1.2";
        scormConnected = scorm.init();
        if (scormConnected) {
            console.log("SCORM connection established.");
            scorm.set("cmi.core.score.min", "0");
            scorm.set("cmi.core.score.max", "100");
            let status = scorm.get("cmi.core.lesson_status");
            if (status === "not attempted" || status === "unknown" || !status) {
                scorm.set("cmi.core.lesson_status", "incomplete");
                scorm.save();
            }
        } else {
            console.warn("SCORM init failed.");
        }
    }

    // Hide mobile controls on non-touch devices (desktops)
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouchDevice) {
        const controlsEl = document.querySelector('.controls');
        if (controlsEl) controlsEl.style.display = 'none';
        console.log("Desktop detected: mobile controls hidden.");
    }
});

window.addEventListener('beforeunload', () => {
    if (scormConnected && scorm) {
        scorm.quit();
    }
});

// --- User Registration Data (captured from form before game starts) ---
let playerData = {
    name: '',
    email: '',
    organisation: ''
};

// Dynamic Scaling Logic
// Compute scale so the game world fits both width AND height.
// Reference game canvas is 1280 x 720. We pick the smaller of
// (screenW / 1280) and (screenH / 720) so the world always fits,
// then clamp between 0.45 (tiny phone landscape) and 0.95 (desktop).
function computeViewScale() {
    const scaleByW = window.innerWidth / 1280;
    const scaleByH = window.innerHeight / 720;
    const auto = Math.min(scaleByW, scaleByH);
    return Math.min(0.95, Math.max(0.45, auto));
}
let VIEW_SCALE = computeViewScale();
let LOGIC_WIDTH = window.innerWidth / VIEW_SCALE;
let WORLD_HEIGHT = window.innerHeight / VIEW_SCALE;
let GROUND_Y = WORLD_HEIGHT - GROUND_OFFSET;

const ASSETS = {
    PLAYER_STAND: "assets/Character_Standing.png",
    PLAYER_RIGHT: "assets/Looking_right_side.png",
    ENEMY_GROUND: "https://prophish-uploads.s3.ap-south-1.amazonaws.com/Wallpapers/fkgudyw6/Enemies_image.png",
    ENEMY_FLY: "https://prophish-uploads.s3.ap-south-1.amazonaws.com/Wallpapers/tfeerkal/bird_1.png",
    COIN_IMG: "assets/Gold_Coin.png",
    BGS: {
        1: "https://prophish-uploads.s3.ap-south-1.amazonaws.com/Wallpapers/0/ORS97Z0.jpg",
        2: "https://prophish-uploads.s3.ap-south-1.amazonaws.com/Wallpapers/891n9pzq/Castel_BG2.jpg",
        3: "https://prophish-uploads.s3.ap-south-1.amazonaws.com/Wallpapers/6968jdn2/Game_Backgrounds_Beach.jpg"
    }
};

// Questions loaded from JSON files
let CYBER_QUESTIONS = {
    1: [],
    2: [],
    3: []
};

// Track used questions per level to prevent repetition
let usedQuestions = {
    1: [],
    2: [],
    3: []
};

// Function to load questions from JSON files
async function loadQuestions() {
    try {
        // Add cache-busting timestamp to force fresh load
        const timestamp = new Date().getTime();
        const response1 = await fetch(`Question/lvl1/questions.json?v=${timestamp}`);
        const response2 = await fetch(`Question/lvl2/questions.json?v=${timestamp}`);
        const response3 = await fetch(`Question/lvl3/questions.json?v=${timestamp}`);

        CYBER_QUESTIONS[1] = await response1.json();
        CYBER_QUESTIONS[2] = await response2.json();
        CYBER_QUESTIONS[3] = await response3.json();

        console.log('✅ Questions loaded successfully:');
        console.log('Level 1 questions:', CYBER_QUESTIONS[1].length);
        console.log('Level 2 questions:', CYBER_QUESTIONS[2].length);
        console.log('Level 3 questions:', CYBER_QUESTIONS[3].length);

        // Log first question of each level to verify
        console.log('Level 1 first question:', CYBER_QUESTIONS[1][0]?.question);
        console.log('Level 2 first question:', CYBER_QUESTIONS[2][0]?.question);
        console.log('Level 3 first question:', CYBER_QUESTIONS[3][0]?.question);
    } catch (error) {
        console.error('❌ Error loading questions:', error);
        alert('Failed to load questions! Please refresh the page.');
    }
}

class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    playTone(freq, type, duration, volume, endFreq) {
        if (!this.ctx || this.muted) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
            gain.gain.setValueAtTime(volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + duration);
        } catch (e) { }
    }

    playJump() { this.playTone(180, 'square', 0.2, 0.05, 500); }
    playLand() { this.playTone(100, 'sine', 0.1, 0.08); }
    playHit() { this.playTone(350, 'sawtooth', 0.4, 0.1, 60); }
    playPrize() { this.playTone(700, 'sine', 0.5, 0.06, 1100); }
    playLevelUp() { this.playTone(400, 'square', 0.15, 0.05, 600); }
    playStomp() { this.playTone(200, 'sine', 0.15, 0.1, 50); }
    playSkill() { this.playTone(300, 'sawtooth', 0.5, 0.1, 800); }
    playEnemyAlert() { this.playTone(800, 'triangle', 0.1, 0.05, 1200); }
    playEnemyAttack() { this.playTone(150, 'sawtooth', 0.3, 0.12, 40); }
    playEnemyDefeat() { this.playTone(250, 'sine', 0.2, 0.08, 10); }
}

const sounds = new SoundManager();

const state = {
    running: false,
    level: 1,
    unlockedLevel: 1,
    score: 0,
    cumulativeScore: 0,
    totalCorrectAnswers: 0,
    totalQuestionsAttempted: 0,
    enemiesDefeated: 0,
    mp: 0,
    lives: MAX_LIVES,
    cameraX: 0,
    castleIndex: 0,
    keys: {},
    correctAnswersThisLvl: 0,
    totalQuestionsThisLvl: QUESTIONS_PER_LEVEL,
    // Track individual level scores
    levelScores: {
        1: { score: 0, percentScore: 0, status: 'Not Attempted', submitted: false },
        2: { score: 0, percentScore: 0, status: 'Not Attempted', submitted: false },
        3: { score: 0, percentScore: 0, status: 'Not Attempted', submitted: false }
    },
    levelsCompleted: 0,
    player: {
        x: 200, y: GROUND_Y - 90, w: 60, h: 90, vx: 0, vy: 0,
        onGround: false, invulnerable: 0, el: null,
        // Coyote time & jump buffer (Issue 3 fix)
        coyoteFrames: 0,
        jumpBufferFrames: 0
    },
    obstacles: [],
    enemies: [],
    prizes: [],
    goal: null
};

// Toast notification system
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.error('Toast container not found');
        return;
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    if (type === 'success') {
        toast.style.borderLeftColor = '#4caf50';
    } else if (type === 'error') {
        toast.style.borderLeftColor = '#f44336';
    }

    container.appendChild(toast);

    // Remove toast after animation
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 3000);
}

// Score submission function
async function submitScore(score, percentScore, status, isFinalSubmission = false) {
    // score = number of correct answers for the level (0-10)
    // percentScore = (score / QUESTIONS_PER_LEVEL) * 100
    const passScore = Math.ceil(QUESTIONS_PER_LEVEL * (PASSING_PERCENT / 100)); // = 6
    const currentLevel = state.level;

    if (isFinalSubmission) {
        try {
            // Submit individual level score with player info
            const response = await fetch('https://prophish.progist.net/api/campaign/checkForm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    URL: window.location.href,
                    // Player identity
                    'Name': playerData.name,
                    'Email': playerData.email,
                    'Organisation': playerData.organisation,
                    // Scoring
                    'Awarded Score': score,
                    'Max Score': QUESTIONS_PER_LEVEL * 3,
                    'Passing Score': Math.ceil(QUESTIONS_PER_LEVEL * 3 * (PASSING_PERCENT / 100)),
                    'Passing Percent': PASSING_PERCENT,
                    'Awarded Percent': percentScore,
                    'Status': status,
                    'Quiz Title': 'Cyber_Castle_Challenge_FINAL',
                    'Level': 'FINAL'
                })
            });

            if (!response.ok) {
                console.warn(`API returned HTTP error! Status: ${response.status}`);
            } else {
                const data = await response.json();
                console.log('Score submission to API success:', data);
            }
        } catch (err) {
            // Silently log network errors so gameplay isn't blocked and LMS saves can continue
            console.error('API submission failed (network error or blocked):', err);
        }
    }

    // -- SCORM Data Push & Local State update (always runs even if API fails) --
    try {
        if (scormConnected && scorm) {
            // Always set score fields
            scorm.set("cmi.core.score.min", "0");
            scorm.set("cmi.core.score.max", "100");
            scorm.set("cmi.core.score.raw", Math.round(percentScore).toString());

            // Proper status mapping
            let scormStatus = "incomplete";
            if (isFinalSubmission) {
                scormStatus = (status.toLowerCase() === "pass") ? "passed" : "failed";
            } else if (status.toLowerCase() === "pass") {
                scormStatus = "passed";
            } else {
                scormStatus = "failed";
            }

            scorm.set("cmi.core.lesson_status", scormStatus);
            scorm.save();
        }

        if (!isFinalSubmission) {
            // Store individual level score
            state.levelScores[currentLevel] = {
                score: score,
                percentScore: percentScore,
                status: status,
                submitted: true // Ensures we don't duplicate on same level attempt
            };

            showToast(`Level ${currentLevel} Score: ${score}/${QUESTIONS_PER_LEVEL} (${percentScore}%)`, 'success');
        } else {
            showToast(`Final Score Submitted: ${score}/${QUESTIONS_PER_LEVEL * 3} (${percentScore}%)!`, 'success');
        }
    } catch (stateErr) {
        console.error('Error updating SCORM or local state:', stateErr);
    }
}

// Submit final combined score for all 3 levels
async function submitFinalCombinedScore() {
    // Each level's .score = number of correct answers (0–10)
    const totalCorrect = state.levelScores[1].score + state.levelScores[2].score + state.levelScores[3].score;
    const totalQuestions = QUESTIONS_PER_LEVEL * 3; // 30
    const finalPercentage = Math.round((totalCorrect / totalQuestions) * 100);
    const finalStatus = finalPercentage >= PASSING_PERCENT ? 'Pass' : 'Fail';

    console.log('Submitting final combined score:', {
        totalCorrect,
        totalQuestions,
        finalPercentage,
        finalStatus,
        levelBreakdown: state.levelScores,
        player: playerData
    });

    // Temporarily set level to 'FINAL' label for the submission
    const prevLevel = state.level;
    if (scormConnected && scorm) {
        scorm.set("cmi.core.lesson_status", "completed");
        scorm.save();
    }
    await submitScore(totalCorrect, finalPercentage, finalStatus, true);
    state.level = prevLevel;
}

// --- Image Preloader ---
// Caches all game images before gameplay starts so large files
// (character sprites ~5-6 MB) don't arrive mid-game on slow connections.
const _imgCache = {};

function _preloadOne(url) {
    return new Promise((resolve) => {
        if (_imgCache[url]) { resolve(); return; }
        const img = new Image();
        img.onload = () => { _imgCache[url] = img; resolve(); };
        img.onerror = () => { console.warn('Could not preload:', url); resolve(); }; // resolve anyway
        img.src = url;
    });
}

async function preloadAllAssets() {
    // Collect every image URL the game will ever use
    const urls = [
        ASSETS.PLAYER_STAND,
        ASSETS.PLAYER_RIGHT,
        ASSETS.ENEMY_GROUND,
        ASSETS.ENEMY_FLY,
        ASSETS.COIN_IMG,
        ...Object.values(ASSETS.BGS)
    ];

    // Build a full-screen loading overlay
    const overlay = document.createElement('div');
    overlay.id = 'preload-overlay';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:#0a0a18',
        'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center',
        'gap:18px', 'font-family:Segoe UI,sans-serif', 'color:#ffd700'
    ].join(';');

    overlay.innerHTML = `
        <div style="font-size:2.2rem;letter-spacing:3px;">⚔️ CYBER CASTLE</div>
        <div style="font-size:1rem;color:#aaa;letter-spacing:1px;">Preparing mission assets…</div>
        <div style="width:260px;height:8px;background:rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;">
            <div id="preload-bar" style="height:100%;width:0%;background:#ff7f27;border-radius:10px;transition:width 0.2s;"></div>
        </div>
        <div id="preload-label" style="font-size:0.85rem;color:#888;">0 / ${urls.length}</div>
    `;
    document.body.appendChild(overlay);

    const bar = document.getElementById('preload-bar');
    const label = document.getElementById('preload-label');
    let done = 0;

    // Load all images in parallel; update bar as each finishes
    await Promise.all(urls.map(url =>
        _preloadOne(url).then(() => {
            done++;
            const pct = Math.round((done / urls.length) * 100);
            if (bar) bar.style.width = pct + '%';
            if (label) label.textContent = `${done} / ${urls.length}`;
        })
    ));

    // Small pause so the bar is visibly full before it disappears
    await new Promise(r => setTimeout(r, 250));
    overlay.remove();
}

// Initialize game
async function init() {
    console.log('Initializing game...');

    // 1. Preload all images FIRST — prevents ghost-character on slow connections
    await preloadAllAssets();

    // 2. Load questions from JSON files
    await loadQuestions();

    state.player.el = document.getElementById('player');
    if (!state.player.el) {
        console.error('Player element not found!');
        return;
    }

    window.addEventListener('resize', handleResize);
    updateCarouselButtons();
    setupEventListeners();
    updateGroundPosition();
    requestAnimationFrame(gameLoop);
    console.log('Game initialized successfully');
}

function handleResize() {
    VIEW_SCALE = computeViewScale();
    LOGIC_WIDTH = window.innerWidth / VIEW_SCALE;

    const oldGroundY = GROUND_Y;
    WORLD_HEIGHT = window.innerHeight / VIEW_SCALE;
    GROUND_Y = WORLD_HEIGHT - GROUND_OFFSET;
    const dy = GROUND_Y - oldGroundY;

    const world = document.getElementById('world');
    if (world) {
        world.style.transformOrigin = 'top left';
        world.style.height = `${WORLD_HEIGHT}px`;
    }

    state.player.y += dy;
    state.obstacles.forEach(o => { o.y += dy; if (o.origY !== undefined) o.origY += dy; });
    state.enemies.forEach(e => { e.y += dy; if (e.origY !== undefined) e.origY += dy; });
    state.prizes.forEach(p => { p.y += dy; if (p.origY !== undefined) p.origY += dy; });
    if (state.goal) state.goal.y += dy;

    updateGroundPosition();
}

function updateGroundPosition() {
    const ground = document.getElementById('ground');
    if (ground) {
        ground.style.top = `${GROUND_Y}px`;
        ground.style.bottom = 'auto';
        ground.style.height = `${GROUND_OFFSET + 1000}px`;
    }
}

// ── Email validation: block personal/generic providers, allow test domains ──────
function isOfficialEmail(email) {
    if (!email || !email.includes('@')) return false;

    const lower = email.toLowerCase().trim();
    const domain = lower.split('@')[1]; // e.g. "company.com"

    if (!domain || !domain.includes('.')) return false;

    // ── Allowed Test / Exception Domains ──────────────────────────────────────
    // Anything under test.in / test.com (exact or subdomain) is permitted
    const ALLOWED_TEST_DOMAINS = [
        'test.in', 'test.com'
    ];
    if (ALLOWED_TEST_DOMAINS.includes(domain) || domain.endsWith('.test.in') || domain.endsWith('.test.com')) {
        return true;
    }

    // ── Blocked Personal / Generic Providers ────────────────────────────────
    const BLOCKED_DOMAINS = [
        // Google
        'gmail.com', 'googlemail.com',
        // Yahoo
        'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.com.au', 'yahoo.fr',
        'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.ca', 'ymail.com', 'rocketmail.com',
        // Microsoft
        'hotmail.com', 'hotmail.co.uk', 'hotmail.in', 'outlook.com', 'outlook.in',
        'live.com', 'live.in', 'msn.com', 'windowslive.com',
        // Apple
        'icloud.com', 'me.com', 'mac.com',
        // AOL / AIM
        'aol.com', 'aim.com',
        // Russian / Eastern European
        'mail.ru', 'yandex.ru', 'yandex.com', 'inbox.ru', 'bk.ru', 'list.ru',
        // Misc popular free
        'protonmail.com', 'proton.me', 'tutanota.com', 'tutanota.de', 'tuta.io',
        'zoho.com', 'fastmail.com', 'fastmail.fm', 'hushmail.com',
        'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.us',
        'web.de', 'freenet.de', 't-online.de',
        'rediffmail.com', 'indiatimes.com',
        'lycos.com', 'excite.com',
        // Temporary / disposable
        'mailinator.com', 'guerrillamail.com', 'trashmail.com', 'tempmail.com',
        'throwam.com', 'sharklasers.com', 'guerrillamailblock.com',
        'spam4.me', 'yopmail.com', 'dispostable.com', 'maildrop.cc',
        // India specific common free
        'sify.com', 'indiainfo.com'
    ];

    return !BLOCKED_DOMAINS.includes(domain);
}

function setupEventListeners() {
    // ── Centralized input mapping (Issue 2 fix: single listener set, no duplicates) ──
    if (!inputListenersAttached) {
        inputListenersAttached = true;

        window.addEventListener('keydown', (e) => {
            state.keys[e.code] = true; // keep for legacy refs
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
            if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
                input.jump = true;
                // Buffer the jump request so it works even slightly before landing
                state.player.jumpBufferFrames = JUMP_BUFFER_FRAMES;
            }
        });

        window.addEventListener('keyup', (e) => {
            state.keys[e.code] = false;
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
            if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') input.jump = false;
        });
    }

    // ── Registration Form ─────────────────────────────────────────────────────
    const regSubmitBtn = document.getElementById('reg-submit-btn');
    if (regSubmitBtn) {
        regSubmitBtn.addEventListener('click', () => {
            const nameVal = (document.getElementById('reg-name')?.value || '').trim();
            const emailVal = (document.getElementById('reg-email')?.value || '').trim();
            const orgVal = (document.getElementById('reg-org')?.value || '').trim();

            let valid = true;

            // Clear previous errors
            ['err-name', 'err-email', 'err-org'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '';
            });
            ['reg-name', 'reg-email', 'reg-org'].forEach(id => {
                document.getElementById(id)?.classList.remove('input-error');
            });

            // Validate Name
            if (nameVal.length < 2) {
                document.getElementById('err-name').textContent = 'Please enter your full name.';
                document.getElementById('reg-name').classList.add('input-error');
                valid = false;
            }

            // Validate Email
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(emailVal)) {
                document.getElementById('err-email').textContent = 'Enter a valid email address.';
                document.getElementById('reg-email').classList.add('input-error');
                valid = false;
            } else if (!isOfficialEmail(emailVal)) {
                document.getElementById('err-email').textContent =
                    'Personal emails are not allowed. Please use your organisation email.';
                document.getElementById('reg-email').classList.add('input-error');
                valid = false;
            }

            // Validate Organisation
            if (orgVal.length < 2) {
                document.getElementById('err-org').textContent = 'Please enter your organisation name.';
                document.getElementById('reg-org').classList.add('input-error');
                valid = false;
            }

            if (!valid) return;

            // Store player data globally
            playerData.name = nameVal;
            playerData.email = emailVal;
            playerData.organisation = orgVal;

            // Close registration modal, open intro
            const regModal = document.getElementById('register-modal');
            const introModal = document.getElementById('intro-modal');
            if (regModal) regModal.classList.remove('active');
            if (introModal) introModal.classList.add('active');
        });

        // Allow submitting with Enter key
        ['reg-name', 'reg-email', 'reg-org'].forEach(id => {
            document.getElementById(id)?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') regSubmitBtn.click();
            });
        });
    }

    const startBtn = document.getElementById('start-adventure-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            sounds.init();
            const introModal = document.getElementById('intro-modal');
            const levelSelectModal = document.getElementById('level-select-modal');
            if (introModal) introModal.classList.remove('active');
            if (levelSelectModal) levelSelectModal.classList.add('active');
        });
    }

    const prevCastleBtn = document.getElementById('prev-castle');
    if (prevCastleBtn) {
        prevCastleBtn.addEventListener('click', () => shiftCarousel(-1));
    }

    const nextCastleBtn = document.getElementById('next-castle');
    if (nextCastleBtn) {
        nextCastleBtn.addEventListener('click', () => shiftCarousel(1));
    }

    document.querySelectorAll('.explore-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.castle-card');
            if (card) {
                const lvl = parseInt(card.getAttribute('data-lvl') || '1');
                if (lvl <= state.unlockedLevel) startLevel(lvl);
            }
        });
    });

    const victoryBtn = document.getElementById('victory-btn');
    if (victoryBtn) {
        victoryBtn.addEventListener('click', () => {
            const modal = document.getElementById('level-up-modal');
            if (modal) {
                modal.classList.remove('active');
            }
            const levelSelectModal = document.getElementById('level-select-modal');
            if (levelSelectModal) {
                levelSelectModal.classList.add('active');
            }
        });
    }

    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            const modal = document.getElementById('level-up-modal');
            if (modal) {
                modal.classList.remove('active');
            }
            startLevel(state.level);
        });
    }

    const skillOkBtn = document.getElementById('skill-ok-btn');
    if (skillOkBtn) {
        skillOkBtn.addEventListener('click', () => {
            const skillModal = document.getElementById('skill-modal');
            if (skillModal) {
                skillModal.classList.remove('active');
            }
            state.running = true;
        });
    }

    const pillHow = document.getElementById('pill-how');
    if (pillHow) {
        pillHow.addEventListener('click', () => {
            const howModal = document.getElementById('how-modal');
            if (howModal) {
                howModal.classList.add('active');
            }
        });
    }

    const closeHowBtn = document.getElementById('close-how-btn');
    if (closeHowBtn) {
        closeHowBtn.addEventListener('click', () => {
            const howModal = document.getElementById('how-modal');
            if (howModal) {
                howModal.classList.remove('active');
            }
        });
    }

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            location.reload();
        });
    }

    // ── Mute Button ───────────────────────────────────────────────────────
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            const isMuted = sounds.toggleMute();
            muteBtn.innerHTML = isMuted ? '<span>🔇</span> MUTED' : '<span>🔊</span> SOUND';
            muteBtn.classList.toggle('muted', isMuted);
        });
    }

    // ── Quit Button ──────────────────────────────────────────────────────
    const quitBtn = document.getElementById('btn-quit');
    if (quitBtn) {
        quitBtn.addEventListener('click', () => {
            if (!state.running) return; // already paused / in modal
            state.running = false;
            const levelSelectModal = document.getElementById('level-select-modal');
            if (levelSelectModal) {
                levelSelectModal.classList.add('active');
            }
            updateCarouselButtons();
        });
    }

    // ── Touch controls (Issue 3 fix: passive:false for instant response) ──
    const bindTouch = (id, code) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                state.keys[code] = true;
                if (code === 'ArrowLeft') input.left = true;
                if (code === 'ArrowRight') input.right = true;
                if (code === 'Space') {
                    input.jump = true;
                    state.player.jumpBufferFrames = JUMP_BUFFER_FRAMES;
                }
            }, { passive: false });

            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                state.keys[code] = false;
                if (code === 'ArrowLeft') input.left = false;
                if (code === 'ArrowRight') input.right = false;
                if (code === 'Space') input.jump = false;
            }, { passive: false });

            // Also handle touchcancel to prevent stuck inputs
            el.addEventListener('touchcancel', (e) => {
                state.keys[code] = false;
                if (code === 'ArrowLeft') input.left = false;
                if (code === 'ArrowRight') input.right = false;
                if (code === 'Space') input.jump = false;
            }, { passive: false });
        }
    };
    bindTouch('btn-left', 'ArrowLeft');
    bindTouch('btn-right', 'ArrowRight');
    bindTouch('btn-jump', 'Space');
}

function shiftCarousel(dir) {
    const cards = document.querySelectorAll('.castle-card');
    if (cards.length === 0) return;

    cards[state.castleIndex].classList.remove('active');
    state.castleIndex = (state.castleIndex + dir + cards.length) % cards.length;
    cards[state.castleIndex].classList.add('active');
}

function updateCarouselButtons() {
    const cards = document.querySelectorAll('.castle-card');
    cards.forEach((card, idx) => {
        const lvl = idx + 1;
        const btn = card.querySelector('.explore-btn');
        if (btn) {
            if (lvl <= state.unlockedLevel) {
                btn.disabled = false;
                btn.innerText = "Explore";
                btn.style.background = "linear-gradient(to right, #ff7f27, #ff5e00)";
            } else {
                btn.disabled = true;
                btn.innerText = "Locked";
                btn.style.background = "#555";
            }
        }
    });
}

function startLevel(lvl) {
    state.level = lvl;
    state.lives = MAX_LIVES;
    state.score = 0;
    state.cameraX = 0;
    state.correctAnswersThisLvl = 0;

    // Reset submitted flag so this attempt can submit its score
    state.levelScores[lvl].submitted = false;

    // Reset used questions for this level
    usedQuestions[lvl] = [];

    const levelSelectModal = document.getElementById('level-select-modal');
    if (levelSelectModal) {
        levelSelectModal.classList.remove('active');
    }

    handleResize();
    spawnLevel(lvl);
    updateHUD();
    updateGroundPosition();

    if (lvl === 2 && state.unlockedLevel === 2) {
        state.running = false;
        const skillModal = document.getElementById('skill-modal');
        if (skillModal) {
            skillModal.classList.add('active');
        }
    } else {
        state.running = true;
    }
}

function createObstacle(x, y, w, h, className, type) {
    const container = document.getElementById('obstacles-container');
    if (!container) {
        console.error('Obstacles container not found');
        return null;
    }

    const el = document.createElement('div');
    el.className = className;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    container.appendChild(el);
    return { x, y, w, h, vx: 0, vy: 0, el, type, fragileState: 0, shakeTime: 0 };
}

function spawnLevel(lvl) {
    const obsC = document.getElementById('obstacles-container');
    const enC = document.getElementById('enemies-container');
    const prC = document.getElementById('prizes-container');
    const goalC = document.getElementById('final-goal-container');
    const bg = document.getElementById('bg-far');

    if (!obsC || !enC || !prC || !goalC || !bg) {
        console.error('Required containers not found');
        return;
    }

    obsC.innerHTML = enC.innerHTML = prC.innerHTML = goalC.innerHTML = "";
    state.obstacles = [];
    state.enemies = [];
    state.prizes = [];
    state.cameraX = 0;
    state.player.x = 200;
    state.player.y = GROUND_Y - state.player.h - 50;

    bg.style.backgroundImage = `url("${ASSETS.BGS[lvl]}")`;
    const spacing = 1170; // Reduced by ~35% from 1800 for tighter obstacle spacing

    for (let i = 0; i < QUESTIONS_PER_LEVEL; i++) {
        const x = 600 + i * spacing; // Start obstacles closer to player (was 1400)
        let prizeY = GROUND_Y - 180;
        let canSpawnEnemy = true;

        if (lvl === 1) {
            const sceneType = Math.floor(Math.random() * 10);
            if (sceneType === 0) {
                state.obstacles.push(createObstacle(x, GROUND_Y - 100, 180, 100, 'obstacle', 'stone'));
                prizeY = GROUND_Y - 360;
            } else if (sceneType === 1) {
                state.obstacles.push(createObstacle(x, GROUND_Y - 180, 150, 180, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 150, GROUND_Y - 100, 100, 35, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 420;
                canSpawnEnemy = false;
            } else if (sceneType === 2) {
                state.obstacles.push(createObstacle(x + 50, GROUND_Y - 140, 120, 35, 'wood-platform', 'wood'));
                state.obstacles.push(createObstacle(x + 250, GROUND_Y - 140, 120, 35, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 370;
            } else if (sceneType === 3) {
                // FIX Issue 1: was previously empty. Now always has an obstacle.
                state.obstacles.push(createObstacle(x + 100, GROUND_Y - 110, 160, 110, 'obstacle', 'stone'));
                prizeY = GROUND_Y - 420;
            } else if (sceneType === 4) {
                state.obstacles.push(createObstacle(x + 150, GROUND_Y - 120, 180, 120, 'obstacle', 'stone'));
                prizeY = GROUND_Y - 460;
            } else if (sceneType === 5) {
                state.obstacles.push(createObstacle(x + 50, GROUND_Y - 120, 100, 35, 'wood-platform', 'wood'));
                state.obstacles.push(createObstacle(x + 200, GROUND_Y - 240, 120, 35, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 480;
                canSpawnEnemy = false;
            } else if (sceneType === 6) {
                state.obstacles.push(createObstacle(x + 150, GROUND_Y - 160, 180, 35, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 450;
            } else if (sceneType === 7) {
                state.obstacles.push(createObstacle(x + 30, GROUND_Y - 100, 100, 100, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 180, GROUND_Y - 200, 140, 200, 'obstacle', 'stone'));
                prizeY = GROUND_Y - 480;
                canSpawnEnemy = false;
            } else if (sceneType === 8) {
                state.obstacles.push(createObstacle(x + 150, GROUND_Y - 30, 200, 30, 'spikes', 'spikes'));
                state.obstacles.push(createObstacle(x + 180, GROUND_Y - 180, 140, 35, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 450;
            } else {
                state.obstacles.push(createObstacle(x + 80, GROUND_Y - 140, 100, 35, 'wood-platform', 'wood'));
                state.obstacles.push(createObstacle(x + 260, GROUND_Y - 140, 100, 35, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 460;
            }
        } else if (lvl === 2) {
            const sceneType = Math.floor(Math.random() * 7);
            if (sceneType === 0) {
                state.obstacles.push(createObstacle(x + 30, GROUND_Y - 220, 160, 220, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 210, GROUND_Y - 140, 100, 40, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 480;
                canSpawnEnemy = false;
            } else if (sceneType === 1) {
                state.obstacles.push(createObstacle(x + 20, GROUND_Y - 140, 140, 40, 'wood-platform', 'wood'));
                state.obstacles.push(createObstacle(x + 200, GROUND_Y - 280, 160, 40, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 500;
            } else if (sceneType === 2) {
                state.obstacles.push(createObstacle(x + 50, GROUND_Y - 30, 400, 30, 'spikes', 'spikes'));
                state.obstacles.push(createObstacle(x + 150, GROUND_Y - 200, 200, 40, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 480;
            } else if (sceneType === 3) {
                const mp = createObstacle(x + 100, GROUND_Y - 220, 240, 45, 'moving-platform', 'moving-h');
                if (mp) {
                    mp.origX = mp.x;
                    mp.vx = 4.0;
                    mp.patrolMin = mp.x - 150;
                    mp.patrolMax = mp.x + 150;
                    state.obstacles.push(mp);
                }
                prizeY = GROUND_Y - 480;
            } else if (sceneType === 4) {
                state.obstacles.push(createObstacle(x + 50, GROUND_Y - 200, 120, 200, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 300, GROUND_Y - 200, 120, 200, 'obstacle', 'stone'));
                prizeY = GROUND_Y - 480;
            } else if (sceneType === 5) {
                const ev = createObstacle(x + 150, GROUND_Y - 150, 180, 40, 'moving-platform', 'moving-v');
                if (ev) {
                    ev.origY = ev.y;
                    ev.vy = 4.0;
                    ev.patrolMin = ev.y - 200;
                    ev.patrolMax = ev.y + 100;
                    state.obstacles.push(ev);
                }
                prizeY = GROUND_Y - 500;
            } else {
                state.obstacles.push(createObstacle(x + 50, GROUND_Y - 180, 140, 35, 'wood-platform', 'broken-wood'));
                state.obstacles.push(createObstacle(x + 250, GROUND_Y - 180, 140, 35, 'wood-platform', 'broken-wood'));
                prizeY = GROUND_Y - 480;
            }
        } else if (lvl === 3) {
            const sceneType = Math.floor(Math.random() * 7);
            if (sceneType === 0) {
                state.obstacles.push(createObstacle(x, GROUND_Y - 30, 900, 30, 'spikes', 'spikes'));
                const mp1 = createObstacle(x + 100, GROUND_Y - 220, 200, 40, 'moving-platform', 'moving-h');
                if (mp1) {
                    mp1.origX = mp1.x;
                    mp1.vx = 5.0;
                    mp1.patrolMin = mp1.x - 100;
                    mp1.patrolMax = mp1.x + 100;
                    state.obstacles.push(mp1);
                }
                const mp2 = createObstacle(x + 500, GROUND_Y - 220, 200, 40, 'moving-platform', 'moving-h');
                if (mp2) {
                    mp2.origX = mp2.x;
                    mp2.vx = -5.0;
                    mp2.patrolMin = mp2.x - 100;
                    mp2.patrolMax = mp2.x + 100;
                    state.obstacles.push(mp2);
                }
                prizeY = GROUND_Y - 360;
                canSpawnEnemy = false;
            } else if (sceneType === 1) {
                state.obstacles.push(createObstacle(x, GROUND_Y - 180, 140, 35, 'wood-platform', 'broken-wood'));
                state.obstacles.push(createObstacle(x + 220, GROUND_Y - 320, 140, 35, 'wood-platform', 'broken-wood'));
                state.obstacles.push(createObstacle(x + 440, GROUND_Y - 180, 140, 35, 'wood-platform', 'broken-wood'));
                prizeY = GROUND_Y - 480;
            } else if (sceneType === 2) {
                const ev1 = createObstacle(x, GROUND_Y - 150, 180, 40, 'moving-platform', 'moving-v');
                if (ev1) {
                    ev1.origY = ev1.y;
                    ev1.vy = 4.0;
                    ev1.patrolMin = ev1.y - 250;
                    ev1.patrolMax = ev1.y + 100;
                    state.obstacles.push(ev1);
                }
                const ev2 = createObstacle(x + 350, GROUND_Y - 300, 180, 40, 'moving-platform', 'moving-v');
                if (ev2) {
                    ev2.origY = ev2.y;
                    ev2.vy = -4.0;
                    ev2.patrolMin = ev2.y - 150;
                    ev2.patrolMax = ev2.y + 200;
                    state.obstacles.push(ev2);
                }
                prizeY = GROUND_Y - 500;
                canSpawnEnemy = false;
            } else if (sceneType === 3) {
                state.obstacles.push(createObstacle(x, GROUND_Y - 180, 150, 180, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 200, GROUND_Y - 360, 150, 360, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 200, GROUND_Y - 180, 40, 40, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 500;
                canSpawnEnemy = false;
            } else if (sceneType === 4) {
                state.obstacles.push(createObstacle(x, GROUND_Y - 220, 120, 220, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 400, GROUND_Y - 220, 120, 220, 'obstacle', 'stone'));
                const mp = createObstacle(x + 180, GROUND_Y - 150, 160, 40, 'moving-platform', 'moving-v');
                if (mp) {
                    mp.origY = mp.y;
                    mp.vy = 6.0;
                    mp.patrolMin = mp.y - 280;
                    mp.patrolMax = mp.y + 100;
                    state.obstacles.push(mp);
                }
                prizeY = GROUND_Y - 550;
            } else if (sceneType === 5) {
                state.obstacles.push(createObstacle(x, GROUND_Y - 120, 200, 120, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 300, GROUND_Y - 220, 200, 220, 'obstacle', 'stone'));
                state.obstacles.push(createObstacle(x + 600, GROUND_Y - 400, 150, 40, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 550;
            } else {
                // FIX Issue 1: Level 3 fallback was previously empty. Always spawn an obstacle.
                state.obstacles.push(createObstacle(x + 80, GROUND_Y - 160, 160, 35, 'wood-platform', 'wood'));
                state.obstacles.push(createObstacle(x + 300, GROUND_Y - 280, 160, 35, 'wood-platform', 'wood'));
                prizeY = GROUND_Y - 490;
            }
        }

        const pEl = document.createElement('div');
        pEl.className = 'prize';
        prC.appendChild(pEl);
        state.prizes.push({
            x: x + 220,
            y: prizeY,
            origY: prizeY,
            w: 55,
            h: 55,
            vx: 0,
            vy: 0,
            el: pEl,
            active: true,
            answered: false
        });

        if (state.level >= 2 && i % 2 === 0 && canSpawnEnemy) {
            const ex = x + 1000;
            const enEl = document.createElement('div');
            const spawnFly = state.level === 3 && Math.random() > 0.4;

            if (spawnFly) {
                const flySize = 130;
                enEl.className = 'enemy enemy-fly';
                enC.appendChild(enEl);
                enEl.style.width = `${flySize}px`;
                enEl.style.height = `${flySize}px`;
                const airY = GROUND_Y - 330 - Math.random() * 120;

                // Two attack patterns: 'v-dive' swoops down in arc, 'zoom' charges horizontally
                const attackPatterns = ['v-dive', 'zoom'];
                const pattern = attackPatterns[Math.floor(Math.random() * attackPatterns.length)];

                // Fixed area of activity — enemy never leaves this radius from homeX/homeY
                const TERRITORY_RADIUS = 480;

                state.enemies.push({
                    x: ex,
                    y: airY,
                    w: flySize,
                    h: flySize,
                    vx: -2.5,
                    vy: 0,
                    el: enEl,
                    type: 'fly',
                    // Home territory — fixed area of activity
                    homeX: ex,
                    homeY: airY,
                    territoryRadius: TERRITORY_RADIUS,
                    // Legacy patrol used as fallback bounds
                    patrolMin: ex - TERRITORY_RADIUS,
                    patrolMax: ex + TERRITORY_RADIUS,
                    origY: airY,
                    origX: ex,
                    // Idle figure-8 orbit angle
                    orbitAngle: 0,
                    orbitSpeed: 0.028 + Math.random() * 0.012,
                    orbitRadiusX: 160 + Math.random() * 80,
                    orbitRadiusY: 55 + Math.random() * 30,
                    spotted: false,
                    attackPattern: pattern, // 'v-dive' or 'zoom'
                    attacking: false,
                    attackPhase: 'idle', // tracks sub-phase within an attack
                    attackCooldown: 0,
                    attackStartX: 0,
                    attackStartY: 0
                });
            } else {
                const eSize = 75;
                enEl.className = 'enemy enemy-ground';
                enC.appendChild(enEl);
                enEl.style.width = `${eSize}px`;
                enEl.style.height = `${eSize}px`;
                state.enemies.push({
                    x: ex,
                    y: GROUND_Y - eSize,
                    w: eSize,
                    h: eSize,
                    vx: -3 - lvl,
                    vy: 0,
                    el: enEl,
                    type: 'ground',
                    patrolMin: ex - 450,
                    patrolMax: ex + 450,
                    spotted: false
                });
            }
        }
    }

    const gEl = document.createElement('div');
    gEl.className = 'final-castle';
    goalC.appendChild(gEl);
    state.goal = {
        x: 800 + QUESTIONS_PER_LEVEL * spacing, // Reduced distance
        y: GROUND_Y - 570, // Aligned to character ground floor
        w: 600,
        h: 600,
        vx: 0,
        vy: 0,
        el: gEl
    };
}

function updatePlatforms() {
    state.obstacles.forEach(ob => {
        if (ob.type === 'moving-h' && ob.patrolMin !== undefined && ob.patrolMax !== undefined) {
            ob.x += ob.vx;
            if (ob.x < ob.patrolMin || ob.x > ob.patrolMax) ob.vx = -ob.vx;
        } else if (ob.type === 'moving-v' && ob.patrolMin !== undefined && ob.patrolMax !== undefined) {
            ob.y += ob.vy;
            if (ob.y < ob.patrolMin || ob.y > ob.patrolMax) ob.vy = -ob.vy;
        }
        if (ob.type === 'broken-wood' && ob.fragileState === 1) {
            ob.shakeTime = (ob.shakeTime || 0) + 1;
            if (ob.shakeTime > 45) {
                ob.fragileState = 2;
                ob.vy = 3;
            }
        }
        if (ob.fragileState === 2) {
            ob.vy += 0.5;
            ob.y += ob.vy;
        }
    });
}

function updatePlayer() {
    const p = state.player;

    // ── Issue 2 Fix: Hard-zero vx before applying input (no phantom drift) ──
    // Reset velocity each frame — only set it if input is truly active.
    if (input.left) {
        p.vx = -WALK_SPEED;
    } else if (input.right) {
        p.vx = WALK_SPEED;
    } else {
        // Fully stop: no multiplier, no residual momentum
        p.vx = 0;
    }

    // ── Issue 3 Fix: Coyote Time — let player jump briefly after walking off edge ──
    const wasOnGround = p.onGround;
    if (wasOnGround) {
        p.coyoteFrames = COYOTE_FRAMES;
    } else if (p.coyoteFrames > 0) {
        p.coyoteFrames--;
    }

    // ── Tick jump buffer down each frame ──
    if (p.jumpBufferFrames > 0) p.jumpBufferFrames--;

    // ── Jump Logic: fire if buffer active AND (on ground OR within coyote window) ──
    const canJump = p.onGround || p.coyoteFrames > 0;
    if (p.jumpBufferFrames > 0 && canJump) {
        p.vy = JUMP_FORCE;
        p.onGround = false;
        p.coyoteFrames = 0;      // consume coyote window
        p.jumpBufferFrames = 0;  // consume buffer
        sounds.playJump();
    }

    // Apply Gravity and Vertical Physics with Clamping
    p.vy += GRAVITY;

    // Sub-stepping to ensure collision resolution at higher speeds
    const steps = 2;
    for (let s = 0; s < steps; s++) {
        p.y += p.vy / steps;

        // Explicit Ground Check per sub-step to prevent tunneling
        if (p.y + p.h > GROUND_Y) {
            p.y = GROUND_Y - p.h;
            p.vy = 0;
            if (!p.onGround) sounds.playLand();
            p.onGround = true;
            break;
        }
    }

    p.x += p.vx;
    if (p.x < 0) p.x = 0;

    // Camera Smoothing
    state.cameraX += (p.x - LOGIC_WIDTH / 3 - state.cameraX) * 0.12;

    // Prevent camera from showing empty space on the left
    if (state.cameraX < 0) state.cameraX = 0;

    if (p.invulnerable > 0) p.invulnerable--;
}

function checkCollisions() {
    let standing = false;
    const p = state.player;

    state.obstacles.forEach(ob => {
        if (ob.type === 'spikes') {
            if (checkAABB(p, ob) && p.invulnerable === 0) handleHit();
            return;
        }
        if (ob.fragileState === 2) return;

        // Enhanced 4-way solid collision resolution
        if (checkAABB(p, ob)) {
            const dx = (p.x + p.w / 2) - (ob.x + ob.w / 2);
            const dy = (p.y + p.h / 2) - (ob.y + ob.h / 2);
            const combinedHalfW = (p.w + ob.w) / 2;
            const combinedHalfH = (p.h + ob.h) / 2;
            const overlapX = combinedHalfW - Math.abs(dx);
            const overlapY = combinedHalfH - Math.abs(dy);

            if (overlapX < overlapY) {
                // Side Collision
                if (dx > 0) p.x = ob.x + ob.w;
                else p.x = ob.x - p.w;
                p.vx = 0;
            } else {
                // Vertical Collision
                if (dy > 0) {
                    // Head-Bump (Bottom Collision)
                    p.y = ob.y + ob.h;
                    if (p.vy < 0) {
                        p.vy = 2.0; // Reverse slightly to prevent sticking
                        sounds.playHit();
                    }
                } else {
                    // Landing (Top Collision)
                    p.y = ob.y - p.h;
                    p.vy = 0;
                    p.onGround = true;
                    standing = true;
                    if (ob.type === 'moving-h') p.x += ob.vx;
                    if (ob.type === 'moving-v') p.y += ob.vy;
                    if (ob.type === 'broken-wood' && ob.fragileState === 0) {
                        ob.fragileState = 1;
                        if (ob.el) ob.el.classList.add('fragile-shake');
                    }
                }
            }
        }
    });

    if (!standing && p.y + p.h < GROUND_Y - 5) p.onGround = false;

    // Check Prizes
    state.prizes.forEach(priz => {
        if (priz.active && !priz.answered && checkAABB(state.player, priz)) {
            priz.active = false;
            triggerChallenge(priz);
        }
    });

    // Check Goal
    if (state.goal && checkAABB(state.player, state.goal)) handleLevelUp();
}

function checkAABB(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── Collision VFX: called when player hits a quiz-box (prize) ─────────────
function spawnCollisionEffect(prize) {
    const effectsC = document.getElementById('effects-container');
    if (!effectsC) return;

    // ── 1. Screen flash overlay ───────────────────────────────────────
    const flash = document.createElement('div');
    flash.className = 'collision-flash';
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove(), { once: true });

    // ── 2. Character glow-bump ───────────────────────────────────────
    const playerEl = state.player.el;
    if (playerEl) {
        playerEl.classList.add('collision-bump');
        playerEl.addEventListener('animationend', () => {
            playerEl.classList.remove('collision-bump');
        }, { once: true });
    }

    // The prize's world coordinates (left, top of the box element)
    const prizeX = prize.x;
    const prizeY = prize.y;
    const bw = prize.w; // box width
    const bh = prize.h; // box height
    const cx = prizeX + bw / 2; // center x in world
    const cy = prizeY + bh / 2; // center y in world

    // ── 3. Dual shockwave rings ──────────────────────────────────────
    ['collision-ring', 'collision-ring-2'].forEach(cls => {
        const ring = document.createElement('div');
        ring.className = cls;
        // Center the ring on the prize box (positioned in world space)
        ring.style.left = `${cx - bw / 2}px`;
        ring.style.top = `${cy - bh / 2}px`;
        effectsC.appendChild(ring);
        ring.addEventListener('animationend', () => ring.remove(), { once: true });
    });

    // ── 4. Starburst impact icon ────────────────────────────────────
    const burst = document.createElement('div');
    burst.className = 'col-starburst';
    burst.style.left = `${cx - 40}px`;
    burst.style.top = `${cy - 40}px`;
    effectsC.appendChild(burst);
    burst.addEventListener('animationend', () => burst.remove(), { once: true });

    // ── 5. Floating particles ─────────────────────────────────────────
    // Mix of ?, ★, ✦, ⚡ symbols in gold / orange / white
    const particleDefs = [
        { sym: '?', glow: '#ffd700' },
        { sym: '?', glow: '#ff7f27' },
        { sym: '★', glow: '#ffd700' },
        { sym: '★', glow: '#fff' },
        { sym: '✦', glow: '#ffd700' },
        { sym: '✦', glow: '#ff7f27' },
        { sym: '⚡', glow: '#fff' },
        { sym: '?', glow: '#fff' },
        { sym: '★', glow: '#ff7f27' },
        { sym: '✦', glow: '#ffd700' },
        { sym: '?', glow: '#ffd700' },
        { sym: '⚡', glow: '#ffd700' }
    ];

    particleDefs.forEach((def, i) => {
        const angle = (Math.PI * 2 / particleDefs.length) * i + (Math.random() - 0.5) * 0.6;
        const speed = 110 + Math.random() * 120;
        const tx = Math.cos(angle) * speed;
        const ty = Math.sin(angle) * speed - 60; // bias upward
        const dur = (0.55 + Math.random() * 0.35).toFixed(2);
        const delay = (Math.random() * 0.08).toFixed(2);
        const rot = (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 270);

        const p = document.createElement('div');
        p.className = 'col-particle';
        p.textContent = def.sym;
        p.style.cssText = `
            left: ${cx - 9}px;
            top:  ${cy - 9}px;
            --tx: ${tx.toFixed(1)}px;
            --ty: ${ty.toFixed(1)}px;
            --dur: ${dur}s;
            --delay: ${delay}s;
            --rot: ${rot.toFixed(0)}deg;
            --glow: ${def.glow};
            color: ${def.glow};
        `;
        effectsC.appendChild(p);
        setTimeout(() => p.remove(), (parseFloat(dur) + parseFloat(delay)) * 1000 + 100);
    });
}

async function triggerChallenge(prize) {

    // ── Collision animation sequence ──────────────────────────────────
    if (prize.el) prize.el.classList.add('hit-feedback');

    // Spawn all collision VFX immediately on collision
    spawnCollisionEffect(prize);

    state.running = false;
    await new Promise(r => setTimeout(r, 720));

    const modal = document.getElementById('question-modal');
    if (!modal) {
        console.error('Question modal not found');
        state.running = true;
        return;
    }

    const qText = document.getElementById('question-text');
    const optCont = document.getElementById('options-container');
    const assistBtn = document.getElementById('accuracy-assist-btn');

    // Guard: elements must exist
    if (!qText || !optCont) {
        console.error('Question modal inner elements missing');
        state.running = true;
        return;
    }

    // ── Pick a question ──────────────────────────────────────────────
    const questionList = CYBER_QUESTIONS[state.level] || CYBER_QUESTIONS[1];

    // Guard: questions may not have loaded yet
    if (!questionList || questionList.length === 0) {
        console.error(`No questions available for level ${state.level}`);
        qText.innerText = 'Questions are still loading. Please try again!';
        optCont.innerHTML = '';
        modal.classList.add('active');
        // Auto-close after 2s and resume game
        setTimeout(() => {
            modal.classList.remove('active');
            state.running = true;
            prize.active = true; // allow retry
        }, 2000);
        return;
    }

    // Get available (unused) question indices
    const allIndices = questionList.map((_, idx) => idx);
    let availableIndices = allIndices.filter(idx => !usedQuestions[state.level].includes(idx));

    // If all questions used, reset the pool
    if (availableIndices.length === 0) {
        console.log(`Level ${state.level} - All questions used, resetting pool`);
        usedQuestions[state.level] = [];
        availableIndices = allIndices;
    }

    const randomArrayIndex = Math.floor(Math.random() * availableIndices.length);
    const selectedQuestionIndex = availableIndices[randomArrayIndex];
    const data = questionList[selectedQuestionIndex];

    // Guard: malformed question entry
    if (!data || !data.question || !Array.isArray(data.options)) {
        console.error(`Malformed question at index ${selectedQuestionIndex}:`, data);
        state.running = true;
        return;
    }

    usedQuestions[state.level].push(selectedQuestionIndex);
    console.log(`Level ${state.level} - Question [${selectedQuestionIndex}]:`, data.question);

    // ── Populate modal content BEFORE making it visible ─────────────
    qText.innerText = data.question;
    optCont.innerHTML = '';

    if (assistBtn) {
        assistBtn.classList.toggle('active', state.level >= 2 && state.mp >= ASSIST_COST);
    }

    // Shuffle options so correct answer isn't always in same position
    const shuffledOptions = data.options.map((opt, idx) => ({ text: opt, originalIndex: idx }));
    for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
    }

    const btns = [];
    shuffledOptions.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt.text;
        btn.onclick = () => {
            prize.answered = true;
            state.totalQuestionsAttempted++;

            if (opt.originalIndex === data.correctIndex) {
                state.correctAnswersThisLvl++;
                state.totalCorrectAnswers++;
                sounds.playPrize();
                if (prize.el) prize.el.style.display = 'none';
                spawnCollectCoinEffect(prize.x, prize.y);
            } else {
                sounds.playHit();
                if (prize.el) prize.el.classList.add('wrong');
                const gameContainer = document.getElementById('game-container');
                if (gameContainer) {
                    gameContainer.classList.add('screen-shake');
                    setTimeout(() => gameContainer.classList.remove('screen-shake'), 400);
                }
            }
            modal.classList.remove('active');
            state.running = true;
            updateHUD();
        };
        optCont.appendChild(btn);
        btns.push(btn);
    });

    // Wire up assist button
    if (assistBtn) {
        assistBtn.onclick = () => {
            if (state.mp >= ASSIST_COST) {
                state.mp -= ASSIST_COST;
                sounds.playSkill();
                updateHUD();

                const wrongIndices = shuffledOptions
                    .map((opt, idx) => ({ idx, isCorrect: opt.originalIndex === data.correctIndex }))
                    .filter(item => !item.isCorrect)
                    .map(item => item.idx)
                    .sort(() => Math.random() - 0.5)
                    .slice(0, 2);

                btns.forEach((b, i) => {
                    if (wrongIndices.includes(i)) b.classList.add('hidden');
                });
                assistBtn.classList.remove('active');
            }
        };
    }

    // ── Show modal NOW that content is ready ─────────────────────────
    modal.classList.add('active');
}

function spawnCollectCoinEffect(x, y) {
    const container = document.getElementById('effects-container');
    if (!container) return;

    const coin = document.createElement('div');
    coin.className = 'collect-coin';
    coin.style.left = `${x}px`;
    coin.style.top = `${y}px`;
    coin.style.animation = 'coinSpinFade 0.7s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    container.appendChild(coin);

    const scoreText = document.createElement('div');
    scoreText.className = 'floating-score';
    scoreText.innerText = '+10';
    scoreText.style.left = `${x + 5}px`;
    scoreText.style.top = `${y - 30}px`;
    container.appendChild(scoreText);

    setTimeout(() => {
        const rect = coin.getBoundingClientRect();
        coin.remove();
        scoreText.remove();
        animateCoinToHUD(rect.left, rect.top);
    }, 650);
}

function animateCoinToHUD(startX, startY) {
    const icon = document.getElementById('hud-score-icon');
    if (!icon) return;

    const rect = icon.getBoundingClientRect();
    const flyer = document.createElement('div');
    flyer.className = 'flying-coin-to-hud';
    flyer.style.left = `${startX}px`;
    flyer.style.top = `${startY}px`;
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '10000';
    flyer.style.transform = 'scale(1.8)';
    flyer.style.transition = 'none';
    flyer.style.filter = 'drop-shadow(0 0 10px gold)';
    document.body.appendChild(flyer);
    flyer.offsetHeight;

    setTimeout(() => {
        flyer.style.transition = 'all 0.9s cubic-bezier(0.42, 0, 0.58, 1)';
        flyer.style.transform = 'scale(0.35)';
        flyer.style.left = `${rect.left}px`;
        flyer.style.top = `${rect.top}px`;
        flyer.style.opacity = '0.5';
    }, 50);

    setTimeout(() => {
        if (flyer.parentNode) {
            flyer.remove();
        }
        state.score += 10;
        updateHUD();
        const pill = document.getElementById('hud-pill-score');
        if (pill) {
            pill.classList.add('score-pop');
            setTimeout(() => pill.classList.remove('score-pop'), 200);
        }
    }, 950);
}

function handleHit() {
    if (state.player.invulnerable > 0) return;
    state.lives--;
    state.player.invulnerable = 60;
    sounds.playEnemyAttack();
    updateHUD();

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.classList.add('screen-shake');
        setTimeout(() => gameContainer.classList.remove('screen-shake'), 400);
    }

    if (state.lives <= 0) {
        state.running = false;
        const modal = document.getElementById('level-up-modal');
        if (!modal) {
            console.error('Level up modal not found');
            return;
        }

        const title = document.getElementById('victory-title');
        const text = document.getElementById('level-up-text');
        const retryBtn = document.getElementById('retry-btn');
        const victoryBtn = document.getElementById('victory-btn');

        if (title) title.innerText = "MISSION FAILED";
        if (text) text.innerText = "Thy defenses were breached! Study and return stronger.";
        if (retryBtn) retryBtn.style.display = 'inline-block';
        if (victoryBtn) victoryBtn.style.display = 'none';

        modal.classList.add('active');

        // Submit score for current level (failed) — only if not already submitted
        if (!state.levelScores[state.level].submitted) {
            const scorePercent = Math.round((state.correctAnswersThisLvl / state.totalQuestionsThisLvl) * 100);
            submitScore(state.correctAnswersThisLvl, scorePercent, 'Fail', false);
        }
    }
}

function handleLevelUp() {
    state.running = false;
    const scorePercent = Math.round((state.correctAnswersThisLvl / state.totalQuestionsThisLvl) * 100);
    const allPrizesCollected = state.prizes.every(p => p.answered === true);
    const scorePass = scorePercent >= PASSING_PERCENT;
    const levelPass = scorePass && allPrizesCollected;

    const modal = document.getElementById('level-up-modal');
    if (!modal) {
        console.error('Level up modal not found');
        return;
    }

    const title = document.getElementById('victory-title');
    const text = document.getElementById('level-up-text');
    const prog = document.getElementById('level-up-progress');
    const retryBtn = document.getElementById('retry-btn');
    const victoryBtn = document.getElementById('victory-btn');

    if (retryBtn) retryBtn.style.display = 'none';
    if (victoryBtn) victoryBtn.style.display = 'none';

    // Submit individual level score — only once per attempt
    const levelStatus = levelPass ? 'Pass' : 'Fail';
    if (!state.levelScores[state.level].submitted) {
        submitScore(state.correctAnswersThisLvl, scorePercent, levelStatus, false);
    }

    if (!levelPass) {
        if (title) {
            title.innerText = "CITADEL INSECURE";
            title.style.color = "#ff3d00";
        }
        let feedback = `<div style="text-align: left; background: rgba(0,0,0,0.4); padding: 15px; border-radius: 10px; margin-top: 10px;">`;
        if (!scorePass) feedback += `<p style="color: #ff9e80;">• Accuracy too low: ${scorePercent}% (${PASSING_PERCENT}% required).</p>`;
        if (!allPrizesCollected) feedback += `<p style="color: #ff9e80;">• Collection incomplete.</p>`;
        feedback += `</div>`;
        if (text) text.innerHTML = `Sentinel, thy performance was insufficient to secure this zone. ${feedback}`;
        if (prog) prog.innerText = "";
        if (retryBtn) retryBtn.style.display = 'inline-block';
        if (victoryBtn) {
            victoryBtn.innerText = "Continue to Map";
            victoryBtn.style.display = 'inline-block';
        }
    } else {
        sounds.playLevelUp();
        state.cumulativeScore += state.score;

        // Mark this level as completed
        if (!state.levelScores[state.level].submitted) {
            state.levelsCompleted++;
        }

        // Unlock next level
        if (state.level === state.unlockedLevel) {
            state.unlockedLevel = Math.min(3, state.unlockedLevel + 1);
        }

        if (title) {
            title.innerText = "CITADEL SECURED!";
            title.style.color = "var(--royal-gold)";
        }

        if (state.level === 3) {
            if (title) title.innerText = "LEGENDARY DEFENDER!";
            if (text) text.innerHTML = "All citadels are secure! Evaluating thy performance...";
            if (prog) prog.innerText = `Final Score: ${state.correctAnswersThisLvl}`;
            if (victoryBtn) {
                victoryBtn.innerText = "View Game Analysis";
                victoryBtn.onclick = async () => {
                    // Check if all 3 levels have been completed with passing scores
                    const allLevelsCompleted = state.levelScores[1].submitted &&
                        state.levelScores[2].submitted &&
                        state.levelScores[3].submitted &&
                        state.levelScores[1].status === 'Pass' &&
                        state.levelScores[2].status === 'Pass' &&
                        state.levelScores[3].status === 'Pass';

                    if (allLevelsCompleted) {
                        console.log('All 3 levels completed! Submitting final combined score...');
                        await submitFinalCombinedScore();
                    }

                    showFinalAnalysis();
                };
            }
        } else {
            if (text) text.innerText = "Thou hast proven thy mastery of digital security!";
            if (prog) prog.innerText = `Level Accuracy: ${scorePercent}%`;
            if (victoryBtn) {
                victoryBtn.innerText = "Continue to Map";
                victoryBtn.onclick = () => {
                    modal.classList.remove('active');
                    const levelSelectModal = document.getElementById('level-select-modal');
                    if (levelSelectModal) {
                        levelSelectModal.classList.add('active');
                    }
                    updateCarouselButtons();

                    // Navigate carousel to the NEXT level (not current)
                    const nextLvl = Math.min(3, state.level + 1);
                    const cards = document.querySelectorAll('.castle-card');
                    if (cards.length > 0) {
                        cards[state.castleIndex].classList.remove('active');
                        state.castleIndex = nextLvl - 1; // 0-indexed
                        cards[state.castleIndex].classList.add('active');
                    }
                };
            }
        }
        if (victoryBtn) victoryBtn.style.display = 'inline-block';
    }
    modal.classList.add('active');
}

function showFinalAnalysis() {
    const modal = document.getElementById('final-analysis-modal');
    if (!modal) {
        console.error('Final analysis modal not found');
        return;
    }

    const totalScoreEl = document.getElementById('final-total-score');
    const avgAccuracyEl = document.getElementById('final-avg-accuracy');
    const securedCountEl = document.getElementById('final-secured-count');
    const enemiesDefeatedEl = document.getElementById('final-enemies-defeated');
    const rankTextEl = document.getElementById('rank-text');

    const avgAccuracy = state.totalQuestionsAttempted > 0 ?
        Math.round((state.totalCorrectAnswers / state.totalQuestionsAttempted) * 100) : 0;

    if (totalScoreEl) totalScoreEl.innerText = state.cumulativeScore.toString();
    if (avgAccuracyEl) avgAccuracyEl.innerText = `${avgAccuracy}%`;
    if (securedCountEl) securedCountEl.innerText = `3/3`;
    if (enemiesDefeatedEl) enemiesDefeatedEl.innerText = state.enemiesDefeated.toString();

    let rank = "Initiate Guard";
    if (avgAccuracy >= 95) rank = "Grandmaster Sentinel";
    else if (avgAccuracy >= 85) rank = "Master Guardian";
    else if (avgAccuracy >= 70) rank = "Elite Warden";
    if (rankTextEl) rankTextEl.innerText = `Sentinel Grade: ${rank}`;

    // Unlock achievements based on performance
    unlockAchievements(avgAccuracy, state.enemiesDefeated, state.cumulativeScore);

    modal.classList.add('active');
    const levelUpModal = document.getElementById('level-up-modal');
    if (levelUpModal) {
        levelUpModal.classList.remove('active');
    }
}

function unlockAchievements(accuracy, enemiesDefeated, totalScore) {
    const achievements = {
        1: accuracy >= PASSING_PERCENT, // Citadel Defender
        2: state.unlockedLevel === 3, // Cyber Legend
        3: accuracy === 100, // Perfect Protocol
        4: enemiesDefeated >= 10, // Bug Squasher
        5: totalScore >= 1000 // Sentinel Elite
    };

    Object.entries(achievements).forEach(([id, unlocked]) => {
        const badge = document.getElementById(`ach-${id}`);
        if (badge && unlocked) {
            badge.classList.add('unlocked');
        }
    });
}

function updateHUD() {
    const scoreVal = document.getElementById('score-val');
    if (scoreVal) scoreVal.innerText = state.score.toString();

    const mpBarFill = document.getElementById('mp-bar-fill');
    if (mpBarFill) mpBarFill.style.width = `${(state.mp / MP_MAX) * 100}%`;

    for (let i = 1; i <= MAX_LIVES; i++) {
        const heart = document.getElementById(`heart-${i}`);
        if (heart) {
            heart.classList.toggle('lost', i > state.lives);
        }
    }
}

function updateEnemies() {
    const p = state.player;
    const time = Date.now();

    state.enemies.forEach(en => {
        if (en.dead) return;

        const dist = Math.abs(en.x - p.x);
        const vertDist = Math.abs(en.y - p.y);

        if (!en.spotted && dist < ENEMY_ALERT_DIST) {
            en.spotted = true;
            sounds.playEnemyAlert();
        }

        // Flying enemy — territory-bounded attack patterns
        if (en.type === 'fly') {
            // Reduce attack cooldown every frame
            if (en.attackCooldown > 0) en.attackCooldown--;

            // Spot the player only when within alert distance
            // (spotted already set above)

            // ── TRIGGER ATTACK ───────────────────────────────────────────────
            // Only attack when spotted, cooldown done, and player is within
            // the enemy's territory radius so it doesn't chase across the map
            const inTerritory = Math.abs(p.x - en.homeX) < en.territoryRadius + 150;
            if (!en.attacking && en.spotted && en.attackCooldown === 0 &&
                dist < 380 && vertDist < 280 && inTerritory) {
                en.attacking = true;
                en.attackPhase = 'charge'; // first sub-phase
                en.attackStartX = en.x;
                en.attackStartY = en.y;
                sounds.playEnemyAlert();
            }

            if (en.attacking) {
                // ── PATTERN 1: V-DIVE ────────────────────────────────────────
                // Phase 'charge'  → swoop diagonally down toward player
                // Phase 'pullup'  → arc back up toward home altitude
                if (en.attackPattern === 'v-dive') {
                    const diveSpeed = 6.5;
                    const targetY = GROUND_Y - 110; // how low it dives

                    if (en.attackPhase === 'charge') {
                        // Move horizontally toward player but clamped to territory
                        const dirX = p.x > en.x ? 1 : -1;
                        const nextX = en.x + dirX * diveSpeed * 0.75;
                        // Clamp to territory before applying
                        en.x = Math.max(en.homeX - en.territoryRadius,
                            Math.min(en.homeX + en.territoryRadius, nextX));

                        // Dive downward
                        if (en.y < targetY - 15) {
                            en.y += diveSpeed;
                        } else {
                            // Reached lowest point — start pull-up
                            en.attackPhase = 'pullup';
                        }
                        applyEnemyObstacleCollision(en, false);

                    } else if (en.attackPhase === 'pullup') {
                        // Arc back up toward home altitude
                        en.y -= diveSpeed * 0.9;
                        // Also drift back toward homeX gently
                        const dxHome = en.homeX - en.x;
                        en.x += Math.sign(dxHome) * Math.min(Math.abs(dxHome) * 0.04, 3);

                        if (en.y <= en.homeY + 10) {
                            // Back at home altitude — attack complete
                            en.y = en.homeY;
                            en.attacking = false;
                            en.attackPhase = 'idle';
                            en.attackCooldown = 210; // ~3.5 s cooldown
                            // Reset orbit so idle loop picks up smoothly
                            en.orbitAngle = 0;
                        }
                    }

                    // ── PATTERN 2: ZOOM CHARGE ───────────────────────────────────
                    // Phase 'charge'  → rocket horizontally at player (territory-limited)
                    // Phase 'return'  → glide back to homeX/homeY
                } else if (en.attackPattern === 'zoom') {
                    const zoomSpeed = 9;

                    if (en.attackPhase === 'charge') {
                        const dirX = p.x > en.attackStartX ? 1 : -1;
                        const nextX = en.x + dirX * zoomSpeed;

                        // Hard-clamp to territory — can't leave home zone
                        en.x = Math.max(en.homeX - en.territoryRadius,
                            Math.min(en.homeX + en.territoryRadius, nextX));
                        // Keep altitude locked during charge
                        en.y = en.attackStartY;

                        applyEnemyObstacleCollision(en, false);

                        // End charge when hit territory wall OR traveled 420 px
                        const traveled = Math.abs(en.x - en.attackStartX);
                        const hitWall = (en.x <= en.homeX - en.territoryRadius + 5 ||
                            en.x >= en.homeX + en.territoryRadius - 5);
                        if (traveled > 420 || hitWall) {
                            en.attackPhase = 'return';
                        }

                    } else if (en.attackPhase === 'return') {
                        // Smoothly drift back toward home position
                        const dxHome = en.homeX - en.x;
                        const dyHome = en.homeY - en.y;
                        const returnSpeed = 4;
                        const dist2Home = Math.sqrt(dxHome * dxHome + dyHome * dyHome);

                        if (dist2Home < 20) {
                            // Close enough — attack cycle done
                            en.x = en.homeX;
                            en.y = en.homeY;
                            en.attacking = false;
                            en.attackPhase = 'idle';
                            en.attackCooldown = 240; // ~4 s cooldown
                            en.orbitAngle = 0;
                        } else {
                            en.x += (dxHome / dist2Home) * returnSpeed;
                            en.y += (dyHome / dist2Home) * returnSpeed;
                        }
                    }
                }

            } else {
                // ── IDLE PATROL — figure-8 orbit inside territory ─────────────
                // Uses Lissajous curve (2× horizontal frequency) for a lazy 8 shape
                en.orbitAngle = (en.orbitAngle || 0) + en.orbitSpeed;
                const targetX = en.homeX + Math.sin(en.orbitAngle) * en.orbitRadiusX;
                const targetY2 = en.homeY + Math.sin(en.orbitAngle * 2) * en.orbitRadiusY;

                // Smooth interpolation toward orbit target (avoids snapping)
                en.x += (targetX - en.x) * 0.06;
                en.y += (targetY2 - en.y) * 0.06;

                // Enforce territory hard boundary as a safety net
                const dxT = en.x - en.homeX;
                const dyT = en.y - en.homeY;
                const radDist = Math.sqrt(dxT * dxT + dyT * dyT);
                if (radDist > en.territoryRadius) {
                    const scale = en.territoryRadius / radDist;
                    en.x = en.homeX + dxT * scale;
                    en.y = en.homeY + dyT * scale;
                }
            }
        } else {
            // Ground enemy movement — with solid obstacle collision
            en.x += en.vx;
            // Patrol-bound fallback (open areas with no wall obstacles)
            if (en.patrolMin && en.x <= en.patrolMin) en.vx = Math.abs(en.vx);
            else if (en.patrolMax && en.x >= en.patrolMax) en.vx = -Math.abs(en.vx);
            // Solid obstacle collision (walls + edge drop-off detection)
            applyEnemyObstacleCollision(en, true);
        }

        if (checkAABB(state.player, en)) {
            if (state.player.vy > 0 && (state.player.y + state.player.h - state.player.vy) <= en.y + 35) {
                en.dead = true;
                state.enemiesDefeated++;
                if (en.el) en.el.classList.add('dead');
                state.player.vy = -16;
                state.mp = Math.min(MP_MAX, state.mp + 20);
                sounds.playEnemyDefeat();
                updateHUD();
            } else if (state.player.invulnerable === 0) handleHit();
        }
    });
}

/**
 * Resolves enemy–obstacle collisions.
 * @param {object}  en         - The enemy object
 * @param {boolean} reverseDir - true = reverse vx on wall hit (ground enemies)
 *                               false = push-out only (flying enemies)
 * @returns {boolean} true if any collision was resolved
 */
function applyEnemyObstacleCollision(en, reverseDir) {
    let hit = false;
    let reversedThisFrame = false; // Prevent multiple reversals in one frame

    for (const ob of state.obstacles) {
        // Skip non-solid types
        if (ob.type === 'spikes') continue;
        if (ob.fragileState === 2) continue; // falling broken platform

        if (!checkAABB(en, ob)) continue;

        const enCX = en.x + en.w / 2;
        const obCX = ob.x + ob.w / 2;
        const enCY = en.y + en.h / 2;
        const obCY = ob.y + ob.h / 2;

        const overlapX = (en.w + ob.w) / 2 - Math.abs(enCX - obCX);
        const overlapY = (en.h + ob.h) / 2 - Math.abs(enCY - obCY);

        if (overlapX < overlapY) {
            // ── Horizontal (side) collision ───────────────────────────────
            if (enCX > obCX) {
                en.x = ob.x + ob.w;   // push right
            } else {
                en.x = ob.x - en.w;   // push left
            }
            if (reverseDir && !reversedThisFrame) {
                en.vx = -en.vx;
                reversedThisFrame = true;
            }
            hit = true;
        } else {
            // ── Vertical collision ────────────────────────────────────────
            // Only snap ground enemies onto platform tops (they shouldn't
            // normally overlap vertically, but handle just in case)
            if (reverseDir && enCY < obCY) {
                en.y = ob.y - en.h;
            }
        }
    }

    // ── Edge (drop-off) detection — ground enemies only ───────────────────────
    // Probe one pixel ahead of the leading foot; if there's no ground or
    // platform there, the enemy would walk off — reverse direction instead.
    if (reverseDir && !reversedThisFrame) {
        const probeX = en.vx > 0 ? en.x + en.w + 2 : en.x - 2;
        const footY = en.y + en.h;
        const probeY = footY + 4;  // just below feet

        // Check if currently standing on the main ground
        const standingOnGround = footY >= GROUND_Y - 4;

        let standingOnPlatform = false;
        if (!standingOnGround) {
            for (const ob of state.obstacles) {
                if (ob.type === 'spikes' || ob.fragileState === 2) continue;
                if (en.x + en.w > ob.x && en.x < ob.x + ob.w && Math.abs(footY - ob.y) < 8) {
                    standingOnPlatform = true;
                    break;
                }
            }
        }

        // If they are walking on a platform, check if there's a platform ahead
        if (standingOnPlatform) {
            let aheadOnPlatform = false;
            for (const ob of state.obstacles) {
                if (ob.type === 'spikes' || ob.fragileState === 2) continue;
                if (probeX >= ob.x && probeX <= ob.x + ob.w && probeY >= ob.y && probeY <= ob.y + ob.h + 8) {
                    aheadOnPlatform = true;
                    break;
                }
            }

            // If about to walk off the edge of the platform, turn around
            if (!aheadOnPlatform) {
                en.vx = -en.vx;
                hit = true;
            }
        }
    }

    return hit;
}

function draw() {
    const world = document.getElementById('world');
    const bgF = document.getElementById('bg-far');

    if (world) {
        world.style.transform = `scale(${VIEW_SCALE}) translate3d(${-state.cameraX}px, 0, 0)`;
    }
    if (bgF) {
        bgF.style.transform = `translate3d(${-state.cameraX * VIEW_SCALE * 0.15}px, 0, 0)`;
    }

    if (state.player.el) {
        const img = state.player.vx !== 0 ? ASSETS.PLAYER_RIGHT : ASSETS.PLAYER_STAND;
        state.player.el.style.backgroundImage = `url("${img}")`;
        state.player.el.style.transform = `translate3d(${state.player.x}px, ${state.player.y}px, 0) scaleX(${state.player.vx < -0.1 ? -1 : 1})`;
        state.player.el.style.opacity = state.player.invulnerable > 0 ?
            (Math.sin(Date.now() / 50) > 0 ? '0.3' : '1') : '1';
    }

    state.obstacles.forEach(o => {
        if (!o.el) return;
        let shakeX = 0;
        if (o.fragileState === 1) shakeX = Math.sin(Date.now() * 0.1) * 3.5;
        o.el.style.transform = `translate3d(${o.x + shakeX}px, ${o.y}px, 0)`;
    });

    state.enemies.forEach(e => {
        if (e.el) {
            e.el.style.transform = `translate3d(${e.x}px, ${e.y}px, 0) scaleX(${e.vx > 0 ? 1 : -1})${e.dead ? ' rotate(90deg)' : ''}`;
        }
    });

    state.prizes.forEach(p => {
        if (p.el && p.origY !== undefined) {
            const bounce = p.answered ? 0 : Math.sin(Date.now() / 300) * 12;
            p.el.style.left = `${p.x}px`;
            p.el.style.top = `${p.origY + bounce}px`;
        }
    });

    if (state.goal?.el) {
        state.goal.el.style.transform = `translate3d(${state.goal.x}px, ${state.goal.y}px, 0)`;
    }
}

function gameLoop() {
    if (state.running) {
        updatePlatforms();
        updatePlayer();
        updateEnemies();
        checkCollisions();
    }
    draw();
    requestAnimationFrame(gameLoop);
}

// Initialize game when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}