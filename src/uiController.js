/**
 * uiController.js
 * Handles DOM interactions: screen transitions, HUD updates,
 * timer/score display, penalty animations, tutorial modal, and carousel navigation.
 * SOC Security Training: Security Control System
 */

import { levelAssetsAreCanonical } from './config.js';

export class UIController {
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

    // Auto-scroll to top when reward video ends and enable next button
    if (this._rewardVideo) {
      this._rewardVideo.addEventListener('ended', () => {
        this.btnNext.disabled = false;
        
        // Try every scrollable ancestor until one works
        const wrap = document.querySelector('.complete-wrap');
        if (wrap) wrap.scrollTo({ top: 0, behavior: 'smooth' });
        const completeScreen = document.getElementById('screen-complete');
        if (completeScreen) completeScreen.scrollTo({ top: 0, behavior: 'smooth' });
        const app = document.getElementById('app');
        if (app) app.scrollTo({ top: 0, behavior: 'smooth' });
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e) {}
        try { document.documentElement.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e) {}
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
      // Last slide: show appropriate CTA but disable until video finishes
      this.btnNext.disabled = true;
      this.btnNext.textContent = this._isFinalLevel
        ? '🏆 Complete Mission'
        : 'Proceed to Next Module';

      setTimeout(() => {
        this._rewardVideo.play().catch(() => {
          // If autoplay fails, re-enable to prevent soft-lock
          this.btnNext.disabled = false;
        });
      }, 300);
    } else {
      this.btnNext.disabled = false;
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
