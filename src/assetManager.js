/**
 * assetManager.js
 * Preloads images and handles audio effects plus theme state.
 * Centralizes background-music ducking when any <video> plays.
 * SOC Security Training: Security Control System
 */

export class AssetManager {
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
