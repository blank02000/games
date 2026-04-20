/**
 * gameManager.js
 * Orchestrates level loading, progression, and win-state flow.
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
    }
  }

  _restart() {
    this._levelIndex = 0;
    this._levelComplete = false;
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
    this._levelComplete = false;

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

    this._ui.showScreen('game');
  }

  _handleSnap() {
    if (this._levelComplete) return;

    this._anim.flashSnap();
    this._assets.play('snap');
    this._puzzleMgr.registerSnap();

    // Haptic feedback on supported devices
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  }

  _handleLevelComplete(levelCfg) {
    if (this._levelComplete) return;

    this._levelComplete = true;
    this._currentScore += (levelCfg.points || 0);
    console.log(`Score Submitted: ${this._currentScore} / 100 points`);
    
    this._assets.play('success');

    setTimeout(() => {
      this._ui.showComplete(levelCfg);
    }, 600);
  }
}
