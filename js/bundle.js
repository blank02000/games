(() => {
// src/config.js
/**
 * config.js
 * Central configuration - levels, snap threshold, asset paths.
 * SOC Security Training: Security Control System
 */

const SNAP_THRESHOLD = 80;        // desktop px
const SNAP_THRESHOLD_TOUCH = 120; // touch px (much more forgiving)

const LEVELS = [
  {
    id: 1,
    label: 'Module 1',
    topic: 'Unauthorized Access',
    threat: 'ELEVATED',
    points: 20,           // base points earned on completion
    targetTime: 30,       // seconds before overtime kicks in
    penaltyEvery: 10,     // deduct every N overtime seconds
    penaltyAmount: 5,     // points deducted per interval
    grid: { cols: 3, rows: 2 },
    image: 'assets/images/Phisical security/level1.png',
    video: 'assets/videos/level1.mp4',
    objective: 'Restore the failed-access scene and reconnect the safe authentication sequence.',
    hint: 'Start with the most recognizable corners, then close the gaps in the center.',
    tip: `
Unauthorized access attempts are often the first sign of a security breach.
If a system denies access, it means authentication has failed - do not try to bypass controls.

- Always use valid credentials
- Never share login access
- Report repeated access failures immediately
    `,
  },
  {
    id: 2,
    label: 'Module 2',
    topic: 'Physical Security (Tailgating)',
    threat: 'HIGH',
    points: 30,
    targetTime: 60,
    penaltyEvery: 10,
    penaltyAmount: 5,
    grid: { cols: 4, rows: 3 },
    image: 'assets/images/Phisical security/level2.png',
    video: 'assets/videos/level2.mp4',
    objective: 'Complete the highest-priority board and lock the physical access story back into place.',
    hint: 'Edge pieces and repeating doorway shapes help anchor the final board faster.',
    tip: `
Tailgating is a physical security breach where an unauthorized person follows an authorized user.

- Never allow someone to enter behind you without authentication
- Always badge individually
- Challenge unknown individuals politely
- Report suspicious access immediately

Physical security is cybersecurity's first layer.
    `,
  },
  {
    id: 3,
    label: 'Module 3',
    topic: 'Zero Trust & MFA',
    threat: 'CRITICAL',
    points: 50,
    targetTime: 90,
    penaltyEvery: 10,
    penaltyAmount: 5,
    grid: { cols: 5, rows: 4 },
    image: 'assets/images/Phisical security/level3.png',
    video: 'assets/videos/level3.mp4',
    objective: 'Rebuild the verification path so identity, device, and access checks line up correctly.',
    hint: 'Use the stronger color and shape landmarks first, then match the smaller verification slices.',
    tip: `
Zero Trust means: trust nothing, verify everything.

- Every user, device, and request must be validated
- Multi-Factor Authentication (MFA) adds an extra security layer
- Location and device checks help detect anomalies

Never assume access - always verify identity.
    `,
  },
];

/** Ensures runtime level config matches canonical module id → assets (guardrail for lazy loading). */
function levelAssetsAreCanonical(levelCfg) {
  const row = LEVELS.find((l) => l.id === levelCfg.id);
  return Boolean(row && row.video === levelCfg.video && row.image === levelCfg.image);
}

// src/uiController.js
/**
 * uiController.js
 * Handles DOM interactions: screen transitions, HUD updates,
 * timer/score display, penalty animations, tutorial modal, and carousel navigation.
 * SOC Security Training: Security Control System
 */


class UIController {
  constructor() {
    this._screens = {
      welcome: document.getElementById('screen-welcome'),
      game: document.getElementById('screen-game'),
      complete: document.getElementById('screen-complete'),
      final: document.getElementById('screen-final'),
    };

    this._levelBadge = document.getElementById('level-badge');
    this._levelLabel = document.getElementById('level-label');
    this._levelTopic = document.getElementById('level-topic');
    this._statusText = document.getElementById('status-text');

    this._infoLevel  = document.getElementById('info-level');
    this._infoPieces = document.getElementById('info-pieces');
    this._infoThreat = document.getElementById('info-threat');
    this._infoTimer  = document.getElementById('info-timer');
    this._infoScore  = document.getElementById('info-score');
    this._penaltyAnchor = document.getElementById('penalty-anchor');

    this._objectiveCopy   = document.getElementById('objective-copy');
    this._interactionHint = document.getElementById('interaction-hint');
    this._stageTopic      = document.getElementById('stage-topic');

    this._tipText    = document.getElementById('tip-text');
    this._revealImg  = document.getElementById('reveal-image');
    this._rewardVideo = document.getElementById('reward-video');

    this.btnStart      = document.getElementById('btn-start');
    this.btnNext       = document.getElementById('btn-next');
    this.btnRestart    = document.getElementById('btn-restart');
    this.btnCloseGame  = document.getElementById('btn-close-game');
    this.btnHowToPlay  = document.getElementById('btn-how-to-play');

    if (this.btnCloseGame) {
      this.btnCloseGame.addEventListener('click', () => window.close());
    }

    // Auto-scroll to top when reward video ends
    if (this._rewardVideo) {
      this._rewardVideo.addEventListener('ended', () => {
        const completeScreen = document.getElementById('screen-complete');
        if (completeScreen) {
          completeScreen.scrollTo({ top: 0, behavior: 'smooth' });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    this._carouselSlides = document.querySelectorAll('.carousel-slide');
    this._carouselDots   = document.querySelectorAll('.carousel-dot');
    this._currentSlide   = 0;
    this._totalSlides    = this._carouselSlides.length;

    this._tutorialModal   = document.getElementById('tutorial-modal');
    this._tutorialOverlay = this._tutorialModal?.querySelector('.tutorial-modal-overlay');
    this._btnTutorialClose = document.getElementById('btn-close-tutorial');

    if (this.btnHowToPlay) {
      this.btnHowToPlay.addEventListener('click', () => this.showTutorial());
    }
    if (this._btnTutorialClose) {
      this._btnTutorialClose.addEventListener('click', () => this.hideTutorial());
    }
    if (this._tutorialOverlay) {
      this._tutorialOverlay.addEventListener('click', () => this.hideTutorial());
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.hideTutorial();
    });

    this._carouselDots.forEach((dot, index) => {
      dot.addEventListener('click', () => this.showCarouselSlide(index));
    });

    this._isFinalLevel = false;
  }

  // ─── Screen management ────────────────────────────────────────────────────

  showScreen(id) {
    const next = this._screens[id];
    if (!next) return;

    Object.values(this._screens).forEach((screen) => {
      screen.classList.remove('screen--active');
      screen.hidden = true;
    });

    next.hidden = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => next.classList.add('screen--active'));
    });
  }

  // ─── Tutorial ─────────────────────────────────────────────────────────────

  showTutorial() {
    if (!this._tutorialModal) return;
    this._tutorialModal.classList.add('modal--active');
    this._tutorialModal.setAttribute('aria-hidden', 'false');
  }

  hideTutorial() {
    if (!this._tutorialModal) return;
    this._tutorialModal.classList.remove('modal--active');
    this._tutorialModal.setAttribute('aria-hidden', 'true');
  }

  // ─── Media cleanup ────────────────────────────────────────────────────────

  releaseModuleMedia() {
    if (this._rewardVideo) {
      this._rewardVideo.pause();
      this._rewardVideo.removeAttribute('src');
      while (this._rewardVideo.firstChild) {
        this._rewardVideo.removeChild(this._rewardVideo.firstChild);
      }
      this._rewardVideo.load();
    }
    if (this._revealImg) {
      this._revealImg.removeAttribute('src');
      this._revealImg.alt = '';
    }
  }

  // ─── HUD setters ──────────────────────────────────────────────────────────

  setLevel(levelCfg, totalPieces) {
    this._levelBadge.hidden = false;
    this._levelLabel.textContent = levelCfg.label;
    this._levelTopic.textContent = levelCfg.topic;
    this._stageTopic.textContent = levelCfg.topic;
    this._statusText.textContent = 'RECOVERY ACTIVE';

    this._infoLevel.textContent  = levelCfg.label;
    this._infoPieces.textContent = totalPieces;
    this._infoThreat.textContent = levelCfg.threat;

    if (this._infoTimer) {
      this._infoTimer.textContent = this._formatTime(levelCfg.targetTime || 30);
      this._infoTimer.classList.remove('timer-urgent', 'timer-overtime');
    }
    if (this._infoScore) {
      this._infoScore.textContent = (levelCfg.points || 0) + ' pts';
    }

    this._objectiveCopy.textContent   = levelCfg.objective;
    this._interactionHint.textContent = this._getInteractionHint(levelCfg.hint);
  }

  /**
   * Update timer display.
   * @param {number} remainingSeconds - seconds left (0 when overtime)
   * @param {boolean} urgent - last 10 seconds
   * @param {boolean} overtime - past target time
   */
  updateTimer(remainingSeconds, urgent, overtime) {
    if (!this._infoTimer) return;
    this._infoTimer.textContent = this._formatTime(remainingSeconds);
    this._infoTimer.classList.toggle('timer-urgent', urgent);
    this._infoTimer.classList.toggle('timer-overtime', overtime);
  }

  /**
   * Update live score display.
   * @param {number} score
   */
  updateScore(score) {
    if (this._infoScore) {
      this._infoScore.textContent = score + ' pts';
    }
  }

  /**
   * Show a floating -N penalty animation near the score.
   * @param {number} amount
   */
  showPenalty(amount) {
    if (!this._penaltyAnchor) return;

    const el = document.createElement('span');
    el.className = 'penalty-float';
    el.textContent = `-${amount}`;
    this._penaltyAnchor.appendChild(el);

    // Remove after animation completes (~1.2s)
    el.addEventListener('animationend', () => el.remove());
  }

  // ─── Completion screens ───────────────────────────────────────────────────

  showComplete(levelCfg, isFinalLevel = false) {
    this._isFinalLevel = isFinalLevel;

    this._revealImg.src = levelCfg.image;
    this._revealImg.alt = `Restored sector: ${levelCfg.topic}`;
    this._tipText.textContent = levelCfg.tip.trim();

    this._rewardVideo.pause();
    if (levelAssetsAreCanonical(levelCfg)) {
      this._rewardVideo.src = levelCfg.video;
      this._rewardVideo.load();
    } else {
      this._rewardVideo.removeAttribute('src');
      while (this._rewardVideo.firstChild) {
        this._rewardVideo.removeChild(this._rewardVideo.firstChild);
      }
      this._rewardVideo.load();
    }

    this._currentSlide = 0;
    this._showSlide(0);

    if (this._autoAdvanceTimer) clearTimeout(this._autoAdvanceTimer);
    this._autoAdvanceTimer = setTimeout(() => {
      this.showCarouselSlide(1);
    }, 2500);

    this.btnNext.textContent = 'Continue';
    this._statusText.textContent = 'MODULE RESTORED';

    this.showScreen('complete');
  }

  advanceCarousel() {
    if (this._currentSlide < this._totalSlides - 1) {
      this.showCarouselSlide(this._currentSlide + 1);
      return false;
    }

    this._rewardVideo.pause();
    return true;
  }

  showCarouselSlide(index) {
    if (index < 0 || index >= this._totalSlides) return;

    if (this._autoAdvanceTimer) {
      clearTimeout(this._autoAdvanceTimer);
      this._autoAdvanceTimer = null;
    }

    this._currentSlide = index;
    this._showSlide(index);

    if (index === this._totalSlides - 1) {
      // Last slide: show appropriate CTA
      this.btnNext.textContent = this._isFinalLevel
        ? '🏆 Complete Mission'
        : 'Proceed to Next Module';

      setTimeout(() => {
        this._rewardVideo.play().catch(() => {});
      }, 300);
    } else {
      this._rewardVideo.pause();
      this.btnNext.textContent = 'Continue';
    }
  }

  showFinal(score = 100) {
    this._levelBadge.hidden = true;
    this._statusText.textContent = 'FULLY OPERATIONAL';
    this._stageTopic.textContent = 'System restored';

    const scoreDisplay = document.getElementById('final-score-display');
    if (scoreDisplay) {
      scoreDisplay.textContent = `${score} pts`;
    }

    this.showScreen('final');
  }

  resetHeader() {
    this._levelBadge.hidden = true;
    this._statusText.textContent = 'STANDBY';
    this._stageTopic.textContent = 'Awaiting recovery';
    this._objectiveCopy.textContent   = 'Align every fragment with its matching board position to restore the active module.';
    this._interactionHint.textContent = 'Drag pieces from the tray and release them near the matching slot.';
    if (this._infoTimer) {
      this._infoTimer.textContent = '–';
      this._infoTimer.classList.remove('timer-urgent', 'timer-overtime');
    }
    if (this._infoScore) this._infoScore.textContent = '–';
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  _showSlide(index) {
    this._carouselSlides.forEach((slide, slideIndex) => {
      slide.classList.toggle('carousel-slide--active', slideIndex === index);
    });

    this._carouselDots.forEach((dot, dotIndex) => {
      dot.classList.toggle('carousel-dot--active', dotIndex === index);
      dot.setAttribute('aria-pressed', dotIndex === index ? 'true' : 'false');
    });
  }

  _getInteractionHint(levelHint) {
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    const controlText = coarsePointer
      ? 'Touch and drag each fragment from the tray, then release it near the matching slot.'
      : 'Drag each fragment from the tray and release it near the matching slot.';
    return `${controlText} ${levelHint}`;
  }

  _formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  }
}

// src/puzzleManager.js
/**
 * puzzleManager.js
 * Builds the puzzle grid, creates sliced pieces, shuffles them,
 * and tracks completion progress.
 * SOC Security Training: Security Control System
 */

class PuzzleManager {
  constructor(board, tray, pieceController) {
    this._board = board;
    this._tray = tray;
    this._pieceCtrl = pieceController;
    this._total = 0;
    this._snapped = 0;
    this._onComplete = null;
  }

  onComplete(fn) {
    this._onComplete = fn;
  }



  build(levelCfg) {
    const { cols, rows } = levelCfg.grid;
    this._total = cols * rows;
    this._snapped = 0;

    this._board.innerHTML = '';
    this._tray.innerHTML = '';
    this._board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this._board.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    this._board.style.setProperty('--board-cols', cols);
    this._board.style.setProperty('--board-rows', rows);
    const frame = this._board.closest('.board-frame');
    if (frame) {
      frame.style.setProperty('--board-cols', cols);
      frame.style.setProperty('--board-rows', rows);
    }

    const pieces = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const id = `piece-r${row}c${col}`;

        const slot = document.createElement('div');
        slot.classList.add('puzzle-slot');
        slot.dataset.targetId = id;
        this._board.appendChild(slot);

        const piece = this._createPiece({ id, col, row, cols, rows, image: levelCfg.image });
        this._pieceCtrl.attachTo(piece);
        pieces.push(piece);
      }
    }

    this._shuffle(pieces).forEach((piece) => this._tray.appendChild(piece));
  }

  get total() {
    return this._total;
  }

  get snapped() {
    return this._snapped;
  }

  registerSnap() {
    let filled = 0;
    let correct = 0;
    const slots = this._board.querySelectorAll('.puzzle-slot');
    
    slots.forEach(slot => {
      const piece = slot.querySelector('.puzzle-piece');
      if (piece) {
        filled++;
        if (slot.dataset.targetId === piece.dataset.id) {
          correct++;
        }
      }
    });

    this._snapped = filled;



    if (correct >= this._total && this._onComplete) {
      this._onComplete();
    }
  }

  _createPiece({ id, col, row, cols, rows, image }) {
    const piece = document.createElement('div');
    piece.classList.add('puzzle-piece');
    piece.id = id;
    piece.dataset.id = id;
    piece.dataset.col = col;
    piece.dataset.row = row;
    piece.dataset.cols = cols;
    piece.dataset.rows = rows;

    const totalPieces = cols * rows;
    const compactLayout = window.matchMedia?.('(max-width: 780px)').matches;
    const trayWidth = this._tray?.getBoundingClientRect?.().width || window.innerWidth;

    // Scale columns up for larger grids so pieces stay a usable size on mobile
    let targetColumns;
    if (compactLayout) {
      targetColumns = totalPieces > 12 ? 4 : totalPieces > 6 ? 3 : 2;
    } else {
      targetColumns = totalPieces > 12 ? 5 : totalPieces > 6 ? 4 : 3;
    }

    const trayPieceW = Math.round(
      Math.max(52, Math.min(120, trayWidth / targetColumns - 10))
    );
    const trayPieceH = Math.round(trayPieceW * 0.75);

    piece.style.width = `${trayPieceW}px`;
    piece.style.height = `${trayPieceH}px`;
    piece.dataset.trayW = trayPieceW;
    piece.dataset.trayH = trayPieceH;

    piece.classList.add('piece--loading');
    const img = new Image();
    img.onload = () => piece.classList.remove('piece--loading');
    img.onerror = () => {
      // Fallback: colour-coded tile so the puzzle is still playable
      piece.classList.remove('piece--loading');
      const hue = Math.round((col * 360 / cols + row * 110) % 360);
      piece.style.backgroundImage = 'none';
      piece.style.backgroundColor = `hsl(${hue},55%,38%)`;
      piece.style.boxShadow = `inset 0 0 0 2px hsla(${hue},55%,65%,0.6)`;
      piece.setAttribute('aria-label', `Piece r${row}c${col}`);
    };
    img.src = image;

    piece.style.backgroundImage = `url('${image}')`;
    piece.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    piece.style.backgroundRepeat = 'no-repeat';

    const posX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
    const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;
    piece.style.backgroundPosition = `${posX}% ${posY}%`;

    return piece;
  }

  _shuffle(items) {
    for (let index = items.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
    }

    return items;
  }
}

// src/pieceController.js
/**
 * pieceController.js
 * Manages drag-and-drop interactions for puzzle pieces using Pointer Events.
 * SOC Security Training: Security Control System
 */


class PieceController {
  constructor(board, tray, onSnap) {
    this._board = board;
    this._tray = tray;
    this._onSnap = onSnap;
    this._dragging = null; // active drag session (ghost exists)
    this._pending = null; // touch-only: pointer is down, drag intent not yet confirmed
    this._activePointerId = null;
    this._lastHoverSlot = null;
    this._selected = null;

    this._slotTapHandlers = new Map(); // slotEl -> handler (for touch tap-to-place flow)
    this._dragIntentThresholdPx = 8;

    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onPointerCancel = this._handlePointerCancel.bind(this);
  }

  attachTo(pieceEl) {
    // Prevent the browser from converting touch drags to scroll/zoom gestures.
    pieceEl.style.touchAction = 'none';

    pieceEl.addEventListener('pointerdown', (event) => this._handlePointerDown(event, pieceEl));
  }

  _selectPiece(pieceEl) {
    this._deselectPiece();
    this._selected = pieceEl;
    pieceEl.classList.add('piece--selected');

    // Highlight all slots and make them tappable for swap/place
    const slots = this._getAllSlots();
    slots.forEach((slot) => {
      slot.classList.add('slot--tap-target');

      const handler = (event) => {
        // Touch UX: tap-slot-to-place only when a piece is selected and no drag is active.
        if (this._dragging) return;
        if (event.pointerType === 'mouse') return;
        if (this._selected !== pieceEl) return;

        event.preventDefault();
        this._handleSwapDrop(pieceEl, slot);
        this._deselectPiece();
      };

      this._slotTapHandlers.set(slot, handler);
      slot.addEventListener('pointerup', handler);
    });
  }

  _deselectPiece() {
    if (this._selected) {
      this._selected.classList.remove('piece--selected');
      this._selected = null;
    }

    // Clean up tap handlers (avoid leaks / ghost handlers across levels)
    for (const [slot, handler] of this._slotTapHandlers.entries()) {
      slot.classList.remove('slot--tap-target');
      slot.removeEventListener('pointerup', handler);
    }
    this._slotTapHandlers.clear();
  }

  destroy() {
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerCancel);
    this._deselectPiece();
    this._clearDragState();
  }

  _handlePointerDown(event, pieceEl) {
    if (this._dragging || this._pending) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.isPrimary === false) return;

    event.preventDefault();

    this._activePointerId = event.pointerId;
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerCancel);

    const isCoarse = window.matchMedia?.('(pointer: coarse)').matches;
    const rect = pieceEl.getBoundingClientRect();

    if (!isCoarse || event.pointerType === 'mouse') {
      // Fine pointer devices: drag-only, start immediately.
      this._deselectPiece();
      this._startDrag({
        pieceEl,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        pieceRect: rect,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      });
      this._updateGhostPosition(event.clientX, event.clientY);
      return;
    }

    // Coarse pointer devices: wait for drag intent (movement threshold) or treat as tap on pointerup.
    this._pending = {
      pieceEl,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      pieceRect: rect,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startedDrag: false,
    };
  }

  _handlePointerMove(event) {
    if (event.pointerId !== this._activePointerId) return;

    if (this._pending && !this._dragging) {
      const dx = event.clientX - this._pending.startClientX;
      const dy = event.clientY - this._pending.startClientY;
      const dist = Math.hypot(dx, dy);

      if (dist > this._dragIntentThresholdPx) {
        // Drag intent confirmed.
        this._deselectPiece(); // don't keep tap-select state while dragging
        const { pieceEl, pointerId, startClientX, startClientY, pieceRect, offsetX, offsetY } = this._pending;
        this._pending = null;
        this._startDrag({
          pieceEl,
          pointerId,
          startClientX,
          startClientY,
          pieceRect,
          offsetX,
          offsetY,
        });
      } else {
        return;
      }
    }

    if (!this._dragging) return;
    this._updateGhostPosition(event.clientX, event.clientY);
  }

  _updateGhostPosition(clientX, clientY) {
    const { ghost, offsetX, offsetY } = this._dragging;
    const x = clientX - offsetX;
    const y = clientY - offsetY;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;

    const centerX = x + ghost.offsetWidth / 2;
    const centerY = y + ghost.offsetHeight / 2;
    this._highlightNearestSlot(centerX, centerY);
  }

  _startDrag({ pieceEl, pointerId, pieceRect, offsetX, offsetY }) {
    const ghost = pieceEl.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.left = `${pieceRect.left}px`;
    ghost.style.top = `${pieceRect.top}px`;
    ghost.style.width = `${pieceRect.width}px`;
    ghost.style.height = `${pieceRect.height}px`;
    ghost.style.margin = '0';
    ghost.style.zIndex = '9998';
    ghost.style.pointerEvents = 'none';
    ghost.classList.add('piece--dragging');
    document.body.appendChild(ghost);

    this._dragging = {
      el: pieceEl,
      ghost,
      offsetX,
      offsetY,
      pointerId,
    };

    pieceEl.style.opacity = '0.22';
    this._getAllSlots().forEach((slot) => slot.classList.add('slot--highlight'));
    document.body.classList.add('is-dragging');
  }

  _highlightNearestSlot(x, y) {
    const slots = this._getAllSlots();
    let closest = null;
    let closestDist = Infinity;

    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const dist = Math.hypot(
        x - (rect.left + rect.width / 2),
        y - (rect.top + rect.height / 2)
      );
      if (dist < closestDist) {
        closestDist = dist;
        closest = slot;
      }
    }

    if (this._lastHoverSlot && this._lastHoverSlot !== closest) {
      this._lastHoverSlot.classList.remove('slot--hover-near');
    }

    if (closest) {
      const rect = closest.getBoundingClientRect();
      const threshold = Math.max(80, Math.min(140, rect.width * 0.75));
      if (closestDist < threshold) {
        closest.classList.add('slot--hover-near');
        this._lastHoverSlot = closest;
        return;
      }
    }

    if (this._lastHoverSlot) {
      this._lastHoverSlot.classList.remove('slot--hover-near');
      this._lastHoverSlot = null;
    }
  }

  _handlePointerUp(event) {
    if (event.pointerId !== this._activePointerId) return;

    // Touch tap (no drag intent reached)
    if (this._pending && !this._dragging) {
      const { pieceEl } = this._pending;
      this._pending = null;
      this._activePointerId = null;
      window.removeEventListener('pointermove', this._onPointerMove);
      window.removeEventListener('pointerup', this._onPointerUp);
      window.removeEventListener('pointercancel', this._onPointerCancel);

      // Coarse pointer primary UX: tap-to-select → tap-slot-to-place.
      if (this._selected === pieceEl) {
        this._deselectPiece();
      } else {
        this._selectPiece(pieceEl);
      }
      return;
    }

    if (!this._dragging) return;

    const { el, ghost, offsetX, offsetY } = this._dragging;
    const dropX = event.clientX - offsetX + (ghost.offsetWidth / 2);
    const dropY = event.clientY - offsetY + (ghost.offsetHeight / 2);
    const target = this._findNearestSlot(dropX, dropY);

    // Clear drag visuals/listeners first (also removes ghost).
    this._clearDragState();
    this._getAllSlots().forEach((s) => s.classList.remove('slot--hover-near'));

    if (target) {
      this._handleSwapDrop(el, target);
      return;
    }

    // Missed drop: always return to tray visibly (prevents "lost" pieces).
    this._returnToTray(el);
    this._returnToOrigin(el);
  }

  _handleSwapDrop(pieceEl, targetSlot) {
    const oldContainer = pieceEl.parentNode;
    const existingPiece = targetSlot.querySelector('.puzzle-piece');

    if (existingPiece && existingPiece === pieceEl) {
      this._snapPieceToSlot(pieceEl, targetSlot);
      return;
    }

    pieceEl.classList.remove('piece--snapped', 'piece--selected');

    if (existingPiece) {
      existingPiece.classList.remove('piece--snapped', 'piece--selected');
      if (oldContainer && oldContainer.classList.contains('puzzle-slot')) {
        this._snapPieceToSlot(existingPiece, oldContainer);
      } else {
        this._returnToTray(existingPiece);
      }
    } else {
      if (oldContainer && oldContainer.classList.contains('puzzle-slot')) {
        oldContainer.classList.remove('slot--snapped');
      }
    }

    this._snapPieceToSlot(pieceEl, targetSlot);
  }

  _returnToTray(pieceEl) {
    pieceEl.classList.remove('piece--snapped', 'piece--selected');
    pieceEl.style.width = `${pieceEl.dataset.trayW}px`;
    pieceEl.style.height = `${pieceEl.dataset.trayH}px`;
    pieceEl.style.opacity = '1';
    this._tray.appendChild(pieceEl);
  }

  _returnToOrigin(pieceEl) {
    pieceEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    pieceEl.style.transform = 'scale(1.05)';
    requestAnimationFrame(() => {
      pieceEl.style.transform = '';
      setTimeout(() => { pieceEl.style.transition = ''; }, 300);
    });
  }

  _handlePointerCancel(event) {
    if (event?.pointerId != null && event.pointerId !== this._activePointerId) return;

    // If the OS cancels the gesture, never lose the piece: return it to tray.
    if (this._dragging?.el) {
      this._returnToTray(this._dragging.el);
    }
    this._pending = null;
    this._clearDragState();
  }

  _clearDragState() {
    if (!this._dragging && !this._pending) {
      return;
    }

    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerCancel);

    this._getAllSlots().forEach((slot) => {
      slot.classList.remove('slot--highlight');
      slot.classList.remove('slot--hover-near');
    });

    if (this._dragging) {
      if (this._dragging.ghost?.isConnected) {
        this._dragging.ghost.remove();
      }
      if (this._dragging.el) {
        this._dragging.el.style.opacity = '1';
      }
    }

    this._dragging = null;
    this._pending = null;
    this._activePointerId = null;
    this._lastHoverSlot = null;
    document.body.classList.remove('is-dragging');
  }

  _getAllSlots() {
    return [...this._board.querySelectorAll('.puzzle-slot')];
  }

  _findNearestSlot(dropX, dropY) {
    const slots = this._getAllSlots();
    let bestSlot = null;
    let bestDistance = Infinity;
    
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const slotCenterX = rect.left + (rect.width / 2);
      const slotCenterY = rect.top + (rect.height / 2);
      const distance = Math.hypot(dropX - slotCenterX, dropY - slotCenterY);

      const threshold = isTouch
        ? Math.max(SNAP_THRESHOLD_TOUCH, rect.width * 0.6)
        : SNAP_THRESHOLD;

      if (distance < threshold && distance < bestDistance) {
        bestDistance = distance;
        bestSlot = slot;
      }
    }

    return bestSlot;
  }

  _snapPieceToSlot(pieceEl, slotEl) {
    slotEl.appendChild(pieceEl);
    slotEl.classList.add('slot--snapped');
    slotEl.classList.remove('slot--highlight');

    const cols = parseInt(pieceEl.dataset.cols, 10);
    const rows = parseInt(pieceEl.dataset.rows, 10);
    const col = parseInt(pieceEl.dataset.col, 10);
    const row = parseInt(pieceEl.dataset.row, 10);

    pieceEl.style.width = '100%';
    pieceEl.style.height = '100%';
    pieceEl.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    pieceEl.style.backgroundPosition = `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
    pieceEl.style.opacity = '1';
    pieceEl.classList.add('piece--snapped');

    this._onSnap(pieceEl);
  }
}

// src/animationController.js
/**
 * animationController.js
 * Handles visual effects: board snap flash and ambient particles.
 * SOC Security Training: Security Control System
 */

class AnimationController {
  constructor() {
    this._snapFlash = document.getElementById('snap-flash');
    this._canvas = document.getElementById('bg-canvas');
    this._ctx = this._canvas ? this._canvas.getContext('2d') : null;
    this._particles = [];
    this._running = false;
    this._raf = null;
  }

  flashSnap() {
    if (!this._snapFlash) return;
    this._snapFlash.classList.remove('flash--active');
    void this._snapFlash.offsetWidth;
    this._snapFlash.classList.add('flash--active');
  }

  startParticles() {
    if (!this._ctx || this._running) return;

    this._running = true;
    this._resize();

    const isMobile = window.innerWidth < 780;
    this._spawnParticles(isMobile ? 15 : 40);

    if (isMobile) {
      this._loopThrottled();
    } else {
      this._loop();
    }
    
    window.addEventListener('resize', () => this._resize());
  }

  stopParticles() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _resize() {
    if (!this._canvas) return;
    this._canvas.width = window.innerWidth;
    this._canvas.height = window.innerHeight;
  }

  _spawnParticles(count) {
    this._particles = [];
    for (let index = 0; index < count; index++) {
      this._particles.push(this._makeParticle());
    }
  }

  _makeParticle() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const colors = [
      'rgba(13,91,215,',
      'rgba(0,165,181,',
      'rgba(30,166,114,',
    ];

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2 + 0.6,
      dx: (Math.random() - 0.5) * 0.2,
      dy: -(Math.random() * 0.32 + 0.04),
      opacity: Math.random() * 0.18 + 0.04,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  }

  _loop() {
    if (!this._running) return;
    this._loopInner();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _loopThrottled() {
    if (!this._running) return;
    setTimeout(() => {
      this._loopInner();
      if (this._running) {
        this._raf = requestAnimationFrame(() => this._loopThrottled());
      }
    }, 1000 / 30);
  }

  _loopInner() {
    const ctx = this._ctx;
    const width = this._canvas.width;
    const height = this._canvas.height;
    ctx.clearRect(0, 0, width, height);

    for (const particle of this._particles) {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = `${particle.color}${particle.opacity})`;
      ctx.fill();

      particle.x += particle.dx;
      particle.y += particle.dy;

      if (particle.y < -5) {
        particle.y = height + 5;
        particle.x = Math.random() * width;
      }
      if (particle.x < -5) {
        particle.x = width + 5;
      }
      if (particle.x > width + 5) {
        particle.x = -5;
      }
    }
  }
}

// src/assetManager.js
/**
 * assetManager.js
 * Preloads images and handles audio effects plus theme state.
 * Centralizes background-music ducking when any <video> plays.
 * SOC Security Training: Security Control System
 */

class AssetManager {
  constructor() {
    this._sfx = {
      bg: document.getElementById('sfx-bg'),
      snap: document.getElementById('sfx-snap'),
      success: document.getElementById('sfx-success'),
    };
    this._imageCache = new Map();
    this._muted = false;
    this._volume = {
      bg: 0.4,
      snap: 0.5,
      success: 0.55,
    };

    this._playingVideos = new Set();
    this._resumeBgAfterVideo = false;

    this._muteBtn = document.getElementById('btn-mute');
    this._muteIcon = document.getElementById('mute-icon');
    this._themeBtn = document.getElementById('btn-theme');
    this._themeIcon = document.getElementById('theme-icon');

    this._onVideoPlay = (e) => this._handleVideoPlay(e.target);
    this._onVideoRelease = (e) => this._handleVideoRelease(e.target);

    this._initTheme();
    this._initMute();
    this._bindVideoDucking();

    Object.entries(this._sfx).forEach(([name, element]) => {
      if (element && this._volume[name] != null) {
        element.volume = this._volume[name];
      }
    });

    if (this._muteBtn) {
      this._muteBtn.addEventListener('click', () => this.toggleMute());
    }
    if (this._themeBtn) {
      this._themeBtn.addEventListener('click', () => this.toggleTheme());
    }
  }

  _bindVideoDucking() {
    const attach = (video) => {
      if (!video || video.tagName !== 'VIDEO' || video.dataset.socDuckBound) return;
      video.dataset.socDuckBound = '1';
      video.addEventListener('play', this._onVideoPlay);
      video.addEventListener('pause', this._onVideoRelease);
      video.addEventListener('ended', this._onVideoRelease);
    };

    document.querySelectorAll('video').forEach(attach);

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'VIDEO') attach(node);
          node.querySelectorAll?.('video').forEach(attach);
        });
      }
    });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  _handleVideoPlay(video) {
    if (!video || this._playingVideos.has(video)) return;
    this._playingVideos.add(video);
    if (this._playingVideos.size !== 1) return;

    const bg = this._sfx.bg;
    this._resumeBgAfterVideo = Boolean(bg && !bg.paused);
    if (bg && !bg.paused) {
      bg.pause();
    }
  }

  _handleVideoRelease(video) {
    if (!video || !this._playingVideos.has(video)) return;
    this._playingVideos.delete(video);
    if (this._playingVideos.size > 0) return;

    if (!this._resumeBgAfterVideo || this._muted) return;
    const bg = this._sfx.bg;
    if (bg && bg.paused) {
      bg.play().catch(() => {});
    }
  }

  _initTheme() {
    const saved = this._readStorage('soc-theme');
    if (saved) {
      this._applyTheme(saved);
      return;
    }

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this._applyTheme(prefersDark ? 'dark' : 'light');
  }

  _initMute() {
    this._muted = this._readStorage('soc-muted') === 'true';
    Object.values(this._sfx).forEach((element) => {
      if (element) {
        element.muted = this._muted;
      }
    });
    this._updateMuteButton();
  }

  _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (this._themeIcon) {
      this._themeIcon.textContent = theme === 'dark' ? 'L' : 'D';
    }
    if (this._themeBtn) {
      this._themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    this._applyTheme(next);
    this._writeStorage('soc-theme', next);
  }

  preloadImage(src) {
    if (this._imageCache.has(src)) {
      return Promise.resolve(this._imageCache.get(src));
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this._imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  /** Preload only the image for the active module (level). */
  preloadForModule(levelCfg) {
    return this.preloadImage(levelCfg.image).catch(() => null);
  }

  /**
   * Drop cached puzzle images except the current module’s art (mobile/safety).
   * Pass null/undefined to clear the entire image cache.
   */
  evictImageCacheExcept(keepSrc) {
    if (!keepSrc) {
      this._imageCache.clear();
      return;
    }
    for (const key of [...this._imageCache.keys()]) {
      if (key !== keepSrc) {
        this._imageCache.delete(key);
      }
    }
  }

  play(name) {
    if (this._muted) return;

    const sfx = this._sfx[name];
    if (!sfx) return;

    if (name === 'bg') {
      if (sfx.paused) {
        sfx.volume = this._volume.bg;
        sfx.play().catch(() => {});
      }
      return;
    }

    if (!sfx.paused) {
      sfx.pause();
    }
    sfx.currentTime = 0;
    sfx.volume = this._volume[name] ?? 0.5;
    sfx.play().catch(() => {});
  }

  toggleMute() {
    this._muted = !this._muted;
    Object.values(this._sfx).forEach((element) => {
      if (element) {
        element.muted = this._muted;
      }
    });
    this._writeStorage('soc-muted', String(this._muted));
    this._updateMuteButton();
  }

  _updateMuteButton() {
    if (this._muteIcon) {
      this._muteIcon.textContent = this._muted ? 'X' : 'S';
    }
    if (this._muteBtn) {
      this._muteBtn.setAttribute('aria-label', this._muted ? 'Unmute audio' : 'Mute audio');
    }
  }

  _readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  _writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage write failures in restricted environments.
    }
  }
}

// src/gameManager.js
/**
 * gameManager.js
 * Orchestrates level loading, progression, win-state flow, and timer/scoring.
 * SOC Security Training: Security Control System
 */







class GameManager {
  constructor() {
    this._levelIndex = 0;
    this._ui = new UIController();
    this._anim = new AnimationController();
    this._assets = new AssetManager();

    this._board = document.getElementById('puzzle-board');
    this._tray = document.getElementById('pieces-tray');

    this._pieceCtrl = null;
    this._puzzleMgr = null;
    this._levelComplete = false;

    // Scoring
    this._currentScore = 0;  // cumulative across levels

    // Timer state (per level)
    this._timerInterval = null;
    this._elapsedSeconds = 0;
    this._levelCfg = null;
    this._levelPoints = 0;    // live points for current level (can be reduced by penalty)
    this._nextPenaltyAt = 0;  // elapsed seconds at which next penalty fires
  }

  async init() {
    this._anim.startParticles();

    this._ui.showScreen('welcome');
    this._ui.resetHeader();

    this._ui.btnStart.addEventListener('click', () => this._startGame());
    this._ui.btnNext.addEventListener('click', () => this._handleNext());
    this._ui.btnRestart.addEventListener('click', () => this._restart());
  }

  _startGame() {
    this._levelIndex = 0;
    this._levelComplete = false;
    this._currentScore = 0;
    this._assets.play('bg');
    this._loadLevel(this._levelIndex);
  }

  _handleNext() {
    const carouselDone = this._ui.advanceCarousel();
    if (carouselDone) {
      this._nextLevel();
    }
  }

  _nextLevel() {
    this._levelIndex += 1;
    if (this._levelIndex < LEVELS.length) {
      this._loadLevel(this._levelIndex);
    } else {
      this._ui.releaseModuleMedia();
      this._assets.evictImageCacheExcept(null);
      this._ui.showFinal(this._currentScore);
      // Dispatch final score event for SCORM
      document.dispatchEvent(new CustomEvent('game:allComplete', { detail: { score: this._currentScore } }));
    }
  }

  _restart() {
    this._levelIndex = 0;
    this._levelComplete = false;
    this._currentScore = 0;
    this._stopTimer();
    this._ui.resetHeader();

    if (this._pieceCtrl) {
      this._pieceCtrl.destroy();
    }

    this._ui.releaseModuleMedia();
    this._assets.evictImageCacheExcept(null);
    this._ui.showScreen('welcome');
  }

  _loadLevel(index) {
    const levelCfg = LEVELS[index];
    this._levelCfg = levelCfg;
    this._levelComplete = false;

    this._stopTimer();

    if (this._pieceCtrl) {
      this._pieceCtrl.destroy();
    }

    this._ui.releaseModuleMedia();
    this._assets.evictImageCacheExcept(levelCfg.image);
    this._assets.preloadForModule(levelCfg).catch(() => {});

    this._pieceCtrl = new PieceController(
      this._board,
      this._tray,
      (pieceEl) => this._handleSnap(pieceEl),
    );

    this._puzzleMgr = new PuzzleManager(this._board, this._tray, this._pieceCtrl);

    this._puzzleMgr.onComplete(() => this._handleLevelComplete(levelCfg));

    this._puzzleMgr.build(levelCfg);
    this._ui.setLevel(levelCfg, this._puzzleMgr.total);

    // Init live level points (can be reduced by penalties)
    this._levelPoints = levelCfg.points || 0;
    this._ui.updateScore(this._currentScore + this._levelPoints);

    this._ui.showScreen('game');
    this._startTimer(levelCfg);
  }

  // ─── Timer ─────────────────────────────────────────────────────────────────

  _startTimer(levelCfg) {
    this._elapsedSeconds = 0;
    const target = levelCfg.targetTime || 30;
    this._nextPenaltyAt = target + (levelCfg.penaltyEvery || 10);

    // Immediately render 0:00
    this._ui.updateTimer(target, false, false);

    this._timerInterval = setInterval(() => {
      this._elapsedSeconds += 1;
      const remaining = target - this._elapsedSeconds;
      const overtime = remaining < 0;
      const urgent = remaining <= 10 && remaining > 0;

      // Display: count down to 00:00, then hold at 00:00 (overtime handled by score)
      const displaySeconds = overtime ? 0 : remaining;
      this._ui.updateTimer(displaySeconds, urgent, overtime);

      // Overtime penalty
      if (overtime && this._elapsedSeconds >= this._nextPenaltyAt) {
        this._nextPenaltyAt += (levelCfg.penaltyEvery || 10);
        this._applyPenalty(levelCfg.penaltyAmount || 5);
      }
    }, 1000);
  }

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  _applyPenalty(amount) {
    this._levelPoints = Math.max(0, this._levelPoints - amount);
    this._ui.updateScore(this._currentScore + this._levelPoints);
    this._ui.showPenalty(amount);
  }

  // ─── Snap / Complete ───────────────────────────────────────────────────────

  _handleSnap() {
    if (this._levelComplete) return;

    this._anim.flashSnap();
    this._assets.play('snap');
    this._puzzleMgr.registerSnap();

    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  }

  _handleLevelComplete(levelCfg) {
    if (this._levelComplete) return;
    this._levelComplete = true;

    this._stopTimer();

    // Bank the (possibly reduced) level points
    this._currentScore += this._levelPoints;
    console.log(`Level ${levelCfg.id} complete. +${this._levelPoints} pts → Total: ${this._currentScore} / 100`);

    // Dispatch for SCORM mid-level save
    document.dispatchEvent(new CustomEvent('game:levelComplete', {
      detail: {
        levelLabel: levelCfg.label,
        levelPoints: this._levelPoints,
        runningScore: this._currentScore,
      },
    }));

    this._assets.play('success');

    const isFinalLevel = levelCfg.id === LEVELS[LEVELS.length - 1].id;

    setTimeout(() => {
      this._ui.showComplete(levelCfg, isFinalLevel);
    }, 600);
  }
}

// src/main.js
/**
 * main.js
 * Application entry point. Boots the GameManager and maintains mobile viewport height.
 * SOC Security Training: Security Control System
 */


const setAppHeight = () => {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
};

window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => {
  setTimeout(setAppHeight, 100);
});

document.addEventListener('DOMContentLoaded', () => {
  setAppHeight();
  const game = new GameManager();
  game.init();
});

})();
