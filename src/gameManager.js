/**
 * gameManager.js
 * Orchestrates level loading, progression, win-state flow, and timer/scoring.
 * SOC Security Training: Security Control System
 */

import { LEVELS } from './config.js';
import { UIController } from './uiController.js';
import { PuzzleManager } from './puzzleManager.js';
import { PieceController } from './pieceController.js';
import { AnimationController } from './animationController.js';
import { AssetManager } from './assetManager.js';

export class GameManager {
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
    const target       = levelCfg.targetTime  || 30;
    const penaltyEvery = levelCfg.penaltyEvery || 10;
    const penaltyAmount = levelCfg.penaltyAmount || 5;
    this._nextPenaltyAt = target + penaltyEvery;

    // Show 0:00 immediately when level starts (counts UP)
    if (this._ui._infoTimer) {
      this._ui._infoTimer.textContent = '0:00';
      this._ui._infoTimer.classList.remove('timer-urgent', 'timer-overtime');
    }

    this._timerInterval = setInterval(() => {
      this._elapsedSeconds += 1;

      const overtime = this._elapsedSeconds > target;
      const remaining = target - this._elapsedSeconds;          // negative when OT
      const urgent = !overtime && remaining <= 10;               // last 10s before limit

      // Display: count up. Once overtime just hold at target value in red.
      const displaySeconds = overtime ? target : this._elapsedSeconds;
      this._ui.updateTimer(displaySeconds, urgent, overtime);

      // Fire penalty every N seconds over the limit
      if (overtime && this._elapsedSeconds >= this._nextPenaltyAt) {
        this._nextPenaltyAt += penaltyEvery;
        this._applyPenalty(penaltyAmount);
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
