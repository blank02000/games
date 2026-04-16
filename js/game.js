/**
 * Visual Puzzle Game Logic
 * Supports drag-and-drop (Pointer Events) on desktop AND mobile.
 * Also supports tap-to-select → tap-to-place for coarse-pointer (touch) devices.
 */

document.addEventListener("DOMContentLoaded", () => {

    // --- Levels Content ---
    const levels = [
        {
            id: 1,
            title: "Level 1: Phishing Anatomy",
            instruction: "Drag pieces to reconstruct the phishing email. On mobile, tap a piece then tap a slot.",
            image: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=600&h=600&fit=crop",
            grid: { rows: 2, cols: 2 },
            feedback: "A sense of urgency and suspicious sender addresses are key phishing indicators."
        },
        {
            id: 2,
            title: "Level 2: Suspicious Portal",
            instruction: "Assemble the fake login interface to spot the credential harvester.",
            image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&h=600&fit=crop",
            grid: { rows: 3, cols: 2 },
            feedback: "The fake portal lacked HTTPS indicators and used generic domain names."
        },
        {
            id: 3,
            title: "Level 3: Incident Trace",
            instruction: "Reconstruct the server log visual to trace the attacker's path.",
            image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&h=600&fit=crop",
            grid: { rows: 3, cols: 3 },
            feedback: "Uncovered the unauthorized access origin. Simulation complete."
        }
    ];

    // --- Game State ---
    const state = {
        currentLevelIndex: 0,
        score: 0,
        mistakesLevel: 0,
        totalMistakes: 0,
        piecesPlaced: 0,
        // Tap-to-select state
        selectedEl: null,
        // Drag state
        drag: null,          // { el, ghost, offsetX, offsetY, pointerId, fromSlot }
        activePointerId: null,
    };

    // --- DOM Elements ---
    const screens = {
        welcome: document.getElementById('screen-welcome'),
        game: document.getElementById('screen-game'),
        levelComplete: document.getElementById('screen-level-complete'),
        gameComplete: document.getElementById('screen-game-complete')
    };
    const boardEl = document.getElementById('puzzle-board');
    const trayEl  = document.getElementById('piece-tray');

    // --- Nav Buttons ---
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-next-level').addEventListener('click', nextLevel);
    document.getElementById('btn-restart').addEventListener('click', resetGame);

    // Deselect when clicking outside tray/board
    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.tray-container') && !e.target.closest('.board-container')) {
            clearSelection();
        }
    });

    // =========================================================
    // DRAG HELPERS
    // =========================================================

    function isCoarsePointer() {
        return window.matchMedia?.('(pointer: coarse)').matches;
    }

    /** Attach pointer-event drag to a piece element */
    function attachDrag(pieceEl) {
        pieceEl.style.touchAction = 'none';

        pieceEl.addEventListener('pointerdown', (e) => {
            if (state.drag) return;                          // already dragging
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (!e.isPrimary) return;

            e.preventDefault();
            e.stopPropagation();

            const rect = pieceEl.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            const fromSlot = pieceEl.parentElement.classList.contains('board-slot')
                ? pieceEl.parentElement : null;

            // For coarse (touch) pointers: only start immediate drag if piece already
            // has a tap-selection, otherwise handle as tap. For mouse: always drag.
            if (isCoarsePointer() && e.pointerType !== 'mouse') {
                // On touch: start drag only if this piece is already selected (second tap),
                // OR always start drag (both behaviours unified via move threshold).
                state._pendingTouch = {
                    pieceEl, offsetX, offsetY, fromSlot,
                    startX: e.clientX, startY: e.clientY,
                    pointerId: e.pointerId,
                };
                state.activePointerId = e.pointerId;
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup',   onPointerUp);
                window.addEventListener('pointercancel', onPointerCancel);
                return;
            }

            // Mouse or fine pointer: start drag immediately
            clearSelection();
            startDrag(pieceEl, e.pointerId, offsetX, offsetY, fromSlot, rect);
            updateGhostPos(e.clientX, e.clientY);

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup',   onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
        });
    }

    function startDrag(pieceEl, pointerId, offsetX, offsetY, fromSlot, rect) {
        const ghost = pieceEl.cloneNode(true);
        ghost.style.cssText = `
            position:fixed;
            left:${rect.left}px; top:${rect.top}px;
            width:${rect.width}px; height:${rect.height}px;
            margin:0; z-index:9999; pointer-events:none;
            border-radius:6px;
            box-shadow:0 8px 30px rgba(59,130,246,0.5);
            opacity:0.92;
            transition: none !important;
        `;
        ghost.classList.add('piece--ghost');
        document.body.appendChild(ghost);

        state.drag = { el: pieceEl, ghost, offsetX, offsetY, pointerId, fromSlot };
        state.activePointerId = pointerId;
        state._pendingTouch = null;

        pieceEl.style.opacity = '0.25';
        getAllSlots().forEach(s => s.classList.add('slot--drag-target'));
        document.body.classList.add('is-dragging');
    }

    function onPointerMove(e) {
        if (e.pointerId !== state.activePointerId) return;

        // Handle touch pending state (drag-intent threshold)
        if (state._pendingTouch && !state.drag) {
            const dx = e.clientX - state._pendingTouch.startX;
            const dy = e.clientY - state._pendingTouch.startY;
            if (Math.hypot(dx, dy) > 8) {
                // Intent confirmed → start drag
                const pt = state._pendingTouch;
                clearSelection();
                const rect = pt.pieceEl.getBoundingClientRect();
                startDrag(pt.pieceEl, pt.pointerId, pt.offsetX, pt.offsetY, pt.fromSlot, rect);
                updateGhostPos(e.clientX, e.clientY);
            }
            return;
        }

        if (!state.drag) return;
        e.preventDefault();
        updateGhostPos(e.clientX, e.clientY);
    }

    function updateGhostPos(cx, cy) {
        const { ghost, offsetX, offsetY } = state.drag;
        const x = cx - offsetX;
        const y = cy - offsetY;
        ghost.style.left = `${x}px`;
        ghost.style.top  = `${y}px`;

        // Highlight nearest slot
        const centerX = x + ghost.offsetWidth  / 2;
        const centerY = y + ghost.offsetHeight / 2;
        highlightNearest(centerX, centerY);
    }

    function highlightNearest(cx, cy) {
        let best = null, bestDist = Infinity;
        getAllSlots().forEach(slot => {
            const r = slot.getBoundingClientRect();
            const d = Math.hypot(cx - (r.left + r.width/2), cy - (r.top + r.height/2));
            if (d < bestDist) { bestDist = d; best = slot; }
        });

        getAllSlots().forEach(s => s.classList.remove('slot--hover'));
        const thresh = Math.max(80, 140);
        if (best && bestDist < thresh) best.classList.add('slot--hover');
    }

    function onPointerUp(e) {
        if (e.pointerId !== state.activePointerId) return;

        removeWindowListeners();

        // Touch tap (no drag started yet)
        if (state._pendingTouch && !state.drag) {
            const { pieceEl } = state._pendingTouch;
            state._pendingTouch = null;
            state.activePointerId = null;
            handleTap(pieceEl);
            return;
        }

        if (!state.drag) { state._pendingTouch = null; state.activePointerId = null; return; }

        const { el, ghost, offsetX, offsetY, fromSlot } = state.drag;
        const dropCX = e.clientX - offsetX + ghost.offsetWidth  / 2;
        const dropCY = e.clientY - offsetY + ghost.offsetHeight / 2;

        clearDragState();
        getAllSlots().forEach(s => s.classList.remove('slot--hover'));

        const target = findNearestSlot(dropCX, dropCY);
        if (target) {
            performDrop(el, target, fromSlot);
        } else {
            // Missed → return piece to where it came from
            if (fromSlot) {
                snapToBoardSlot(el, fromSlot, false); // silent re-snap
            } else {
                returnToTray(el);
            }
        }
    }

    function onPointerCancel(e) {
        removeWindowListeners();
        if (state.drag?.el) {
            const { el, fromSlot } = state.drag;
            clearDragState();
            if (fromSlot) snapToBoardSlot(el, fromSlot, false);
            else returnToTray(el);
        }
        state._pendingTouch = null;
        state.activePointerId = null;
    }

    function removeWindowListeners() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup',   onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
    }

    function clearDragState() {
        if (state.drag) {
            if (state.drag.ghost?.isConnected) state.drag.ghost.remove();
            if (state.drag.el) state.drag.el.style.opacity = '1';
        }
        state.drag = null;
        state.activePointerId = null;
        state._pendingTouch = null;
        getAllSlots().forEach(s => {
            s.classList.remove('slot--drag-target');
            s.classList.remove('slot--hover');
        });
        document.body.classList.remove('is-dragging');
    }

    function getAllSlots() {
        return [...boardEl.querySelectorAll('.board-slot')];
    }

    function findNearestSlot(cx, cy) {
        const touch = isCoarsePointer();
        let best = null, bestDist = Infinity;
        getAllSlots().forEach(slot => {
            const r = slot.getBoundingClientRect();
            const d = Math.hypot(cx - (r.left + r.width/2), cy - (r.top + r.height/2));
            const threshold = touch ? Math.max(80, r.width * 0.7) : Math.max(60, r.width * 0.55);
            if (d < threshold && d < bestDist) { bestDist = d; best = slot; }
        });
        return best;
    }

    // =========================================================
    // DROP LOGIC (drag ↔ snap)
    // =========================================================

    function performDrop(pieceEl, targetSlot, fromSlot) {
        const existingPiece = targetSlot.querySelector('.puzzle-piece');

        if (existingPiece === pieceEl) {
            // Dropped back onto own slot
            snapToBoardSlot(pieceEl, targetSlot, false);
            return;
        }

        const level = levels[state.currentLevelIndex];
        const pieceId = parseInt(pieceEl.dataset.id);
        const slotId  = parseInt(targetSlot.dataset.slotId);

        // If something is already in the target, swap it to where dragged piece came from
        if (existingPiece) {
            existingPiece.classList.remove('piece--snapped');
            if (fromSlot) {
                snapToBoardSlot(existingPiece, fromSlot, false); // silent swap
            } else {
                returnToTray(existingPiece);
            }
        } else {
            // Target was empty — clear fromSlot's snapped state
            if (fromSlot) fromSlot.classList.remove('slot--snapped');
        }

        // Check correctness
        const isCorrect = (slotId === pieceId);
        snapToBoardSlot(pieceEl, targetSlot, true, isCorrect, fromSlot);
    }

    function snapToBoardSlot(pieceEl, slotEl, triggerScoring, isCorrect, fromSlot) {
        const wasAlreadySnapped = pieceEl.classList.contains('piece--snapped');

        // Remove from wherever it is now
        pieceEl.classList.remove('piece--snapped', 'in-tray', 'selected');
        pieceEl.style.width  = '100%';
        pieceEl.style.height = '100%';
        pieceEl.style.opacity = '1';

        const level = levels[state.currentLevelIndex];
        const cols = level.grid.cols;
        const rows = level.grid.rows;
        const col = parseInt(pieceEl.dataset.col, 10);
        const row = parseInt(pieceEl.dataset.row, 10);

        pieceEl.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
        pieceEl.style.backgroundPosition = `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
        pieceEl.classList.add('in-board', 'piece--snapped');

        slotEl.classList.add('slot--snapped');
        slotEl.appendChild(pieceEl);

        if (!triggerScoring) return;

        const fromTray = !fromSlot;
        if (isCorrect) {
            if (fromTray && !wasAlreadySnapped) {
                // Only count score when placing fresh from tray into correct spot
                state.piecesPlaced++;
                state.score += 100;
                updateProgress();
                slotEl.classList.add('correct-move');
                showToast("Correct!", "success");
            } else {
                showToast("Piece placed!", "success");
            }
        } else {
            if (fromTray) {
                state.mistakesLevel++;
                state.totalMistakes++;
                state.score = Math.max(0, state.score - 10);
                showToast("Incorrect slot. Try again.", "error");
                pieceEl.classList.add('wrong-move');
                setTimeout(() => pieceEl.classList.remove('wrong-move'), 350);
            }
        }

        updateTopHeader();
        checkLevelComplete();
    }

    function returnToTray(pieceEl) {
        pieceEl.classList.remove('piece--snapped', 'in-board', 'selected');
        pieceEl.classList.add('in-tray');
        pieceEl.style.width  = `${pieceEl.dataset.trayW}px`;
        pieceEl.style.height = `${pieceEl.dataset.trayH}px`;
        pieceEl.style.opacity = '1';
        trayEl.appendChild(pieceEl);
        attachDrag(pieceEl);
    }

    // =========================================================
    // TAP-TO-SELECT (touch fallback)
    // =========================================================

    function handleTap(pieceEl) {
        if (state.selectedEl && state.selectedEl !== pieceEl) {
            // Another piece is selected — deselect previous
            clearSelection();
        }
        if (state.selectedEl === pieceEl) {
            clearSelection();
        } else {
            selectPiece(pieceEl);
        }
    }

    function selectPiece(pieceEl) {
        clearSelection();
        state.selectedEl = pieceEl;
        pieceEl.classList.add('selected');
        getAllSlots().forEach(s => {
            s.classList.add('slot--tap-target');
        });
    }

    function clearSelection() {
        if (state.selectedEl) {
            state.selectedEl.classList.remove('selected');
            state.selectedEl = null;
        }
        getAllSlots().forEach(s => s.classList.remove('slot--tap-target', 'slot--drag-target', 'highlight'));
    }

    // Board slot tap (for tap-to-place flow)
    boardEl.addEventListener('click', (e) => {
        if (state.drag) return; // ignore if drag just finished
        const slotEl = e.target.closest('.board-slot');
        if (!slotEl || !state.selectedEl) return;

        const pieceEl = state.selectedEl;
        const fromSlot = pieceEl.parentElement.classList.contains('board-slot')
            ? pieceEl.parentElement : null;

        clearSelection();
        performDrop(pieceEl, slotEl, fromSlot);
    });

    // =========================================================
    // GAME FUNCTIONS
    // =========================================================

    function switchScreen(key) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[key].classList.add('active');
    }

    function startGame() {
        state.currentLevelIndex = 0;
        state.score = 0;
        state.totalMistakes = 0;
        loadLevel();
        switchScreen('game');
    }

    function resetGame() { startGame(); }

    function loadLevel() {
        const level = levels[state.currentLevelIndex];
        state.mistakesLevel = 0;
        state.piecesPlaced  = 0;
        state.selectedEl    = null;
        clearDragState();

        document.getElementById('level-indicator').textContent  = `Level ${level.id}/${levels.length}`;
        document.getElementById('score-indicator').textContent  = `Score: ${state.score}`;
        document.getElementById('level-title').textContent      = level.title;
        document.getElementById('level-instruction').textContent = level.instruction;
        document.getElementById('progress-bar').style.width     = '0%';

        boardEl.innerHTML = '';
        trayEl.innerHTML  = '';

        const { rows, cols } = level.grid;
        boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        boardEl.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
        boardEl.style.aspectRatio         = `${cols} / ${rows}`;

        // Build slots
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const id = r * cols + c;
                const slot = document.createElement('div');
                slot.className = 'board-slot';
                slot.dataset.slotId = id;
                boardEl.appendChild(slot);
            }
        }

        // Build pieces (shuffled)
        const piecesData = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                piecesData.push({ id: r * cols + c, r, c });
            }
        }
        piecesData.sort(() => Math.random() - 0.5);

        const TRAY_SIZE = 72;

        piecesData.forEach(p => {
            const piece = document.createElement('div');
            piece.className = 'puzzle-piece in-tray';
            piece.dataset.id     = p.id;
            piece.dataset.col    = p.c;
            piece.dataset.row    = p.r;
            piece.dataset.cols   = cols;
            piece.dataset.rows   = rows;
            piece.dataset.trayW  = TRAY_SIZE;
            piece.dataset.trayH  = TRAY_SIZE;

            piece.style.backgroundImage    = `url(${level.image})`;
            piece.style.backgroundSize     = `${cols * 100}% ${rows * 100}%`;
            const posX = cols === 1 ? 0 : (p.c / (cols - 1)) * 100;
            const posY = rows === 1 ? 0 : (p.r / (rows - 1)) * 100;
            piece.style.backgroundPosition = `${posX}% ${posY}%`;
            piece.style.width  = `${TRAY_SIZE}px`;
            piece.style.height = `${TRAY_SIZE}px`;

            trayEl.appendChild(piece);
            attachDrag(piece);
        });
    }

    function checkLevelComplete() {
        const level = levels[state.currentLevelIndex];
        const total = level.grid.rows * level.grid.cols;

        // Count correct placements directly from the DOM
        let correctCount = 0;
        getAllSlots().forEach(slot => {
            const piece = slot.querySelector('.puzzle-piece');
            if (piece && parseInt(piece.dataset.id) === parseInt(slot.dataset.slotId)) {
                correctCount++;
            }
        });

        // Update piecesPlaced based on actual board state
        state.piecesPlaced = correctCount;
        updateProgress();

        if (correctCount >= total) {
            setTimeout(handleLevelComplete, 600);
        }
    }

    function updateTopHeader() {
        document.getElementById('score-indicator').textContent = `Score: ${state.score}`;
    }

    function updateProgress() {
        const level = levels[state.currentLevelIndex];
        const total = level.grid.rows * level.grid.cols;
        document.getElementById('progress-bar').style.width = `${(state.piecesPlaced / total) * 100}%`;
    }

    function handleLevelComplete() {
        const level = levels[state.currentLevelIndex];
        document.getElementById('level-feedback').textContent  = level.feedback;
        document.getElementById('level-mistakes').textContent  = state.mistakesLevel;
        switchScreen('levelComplete');
    }

    function nextLevel() {
        state.currentLevelIndex++;
        if (state.currentLevelIndex < levels.length) {
            loadLevel();
            switchScreen('game');
        } else {
            document.getElementById('final-score').textContent    = state.score;
            document.getElementById('total-mistakes').textContent = state.totalMistakes;
            switchScreen('gameComplete');
        }
    }

    // =========================================================
    // TOAST NOTIFICATIONS
    // =========================================================
    function showToast(message, type = "info") {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 2800);
    }
});
