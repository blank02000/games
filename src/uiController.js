/**
 * uiController.js
 * Handles DOM interactions: screen transitions, HUD updates,
 * tutorial modal state, and completion carousel navigation.
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

    this._infoLevel = document.getElementById('info-level');
    this._infoPieces = document.getElementById('info-pieces');
    this._infoThreat = document.getElementById('info-threat');

    this._progressFill = document.getElementById('progress-fill');
    this._piecesRemaining = document.getElementById('pieces-remaining');
    this._hudPercent = document.getElementById('hud-percent');
    this._progressCopy = document.getElementById('hud-progress-copy');
    this._objectiveCopy = document.getElementById('objective-copy');
    this._interactionHint = document.getElementById('interaction-hint');
    this._stageTopic = document.getElementById('stage-topic');

    this._tipText = document.getElementById('tip-text');
    this._revealImg = document.getElementById('reveal-image');
    this._rewardVideo = document.getElementById('reward-video');

    this.btnStart = document.getElementById('btn-start');
    this.btnNext = document.getElementById('btn-next');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnCloseGame = document.getElementById('btn-close-game');
    this.btnHowToPlay = document.getElementById('btn-how-to-play');

    if (this.btnCloseGame) {
      this.btnCloseGame.addEventListener('click', () => window.close());
    }

    this._carouselSlides = document.querySelectorAll('.carousel-slide');
    this._carouselDots = document.querySelectorAll('.carousel-dot');
    this._currentSlide = 0;
    this._totalSlides = this._carouselSlides.length;

    this._tutorialModal = document.getElementById('tutorial-modal');
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
      if (event.key === 'Escape') {
        this.hideTutorial();
      }
    });

    this._carouselDots.forEach((dot, index) => {
      dot.addEventListener('click', () => this.showCarouselSlide(index));
    });
  }

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

  /**
   * Release module-scoped heavy media when leaving the completion flow or reloading a level.
   */
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

  setLevel(levelCfg, totalPieces) {
    this._levelBadge.hidden = false;
    this._levelLabel.textContent = levelCfg.label;
    this._levelTopic.textContent = levelCfg.topic;
    this._stageTopic.textContent = levelCfg.topic;
    this._statusText.textContent = 'RECOVERY ACTIVE';

    this._infoLevel.textContent = levelCfg.label;
    this._infoPieces.textContent = totalPieces;
    this._infoThreat.textContent = levelCfg.threat;
    this._objectiveCopy.textContent = levelCfg.objective;
    this._interactionHint.textContent = this._getInteractionHint(levelCfg.hint);
  }

  updateProgress(snapped, total) {
    const pct = total ? Math.round((snapped / total) * 100) : 0;
    const remaining = Math.max(total - snapped, 0);

    this._progressFill.style.width = `${pct}%`;
    this._progressFill.setAttribute('aria-valuenow', pct);
    this._piecesRemaining.textContent = `${remaining} remaining`;
    this._hudPercent.textContent = `${pct}%`;
    this._progressCopy.textContent = `${snapped} of ${total} fragments locked`;

    if (snapped === 0) {
      this._statusText.textContent = 'RECOVERY ACTIVE';
    } else if (snapped < total) {
      this._statusText.textContent = `RECOVERY ${pct}%`;
    }
  }

  showComplete(levelCfg) {
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
      this.btnNext.textContent = 'Proceed to Next Module';
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
    this._hudPercent.textContent = '100%';
    this._progressCopy.textContent = 'All fragments secured';

    const scoreDisplay = document.getElementById('final-score-display');
    if (scoreDisplay) {
      scoreDisplay.textContent = `${score}%`;
    }

    this.showScreen('final');
  }

  resetHeader() {
    this._levelBadge.hidden = true;
    this._statusText.textContent = 'STANDBY';
    this._stageTopic.textContent = 'Awaiting recovery';
    this._hudPercent.textContent = '0%';
    this._progressCopy.textContent = '0 of 0 fragments locked';
    this._objectiveCopy.textContent = 'Align every fragment with its matching board position to restore the active module.';
    this._interactionHint.textContent = 'Drag pieces from the tray and release them near the matching slot.';
  }

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
}
