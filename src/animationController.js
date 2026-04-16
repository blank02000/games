/**
 * animationController.js
 * Handles visual effects: board snap flash and ambient particles.
 * SOC Security Training: Security Control System
 */

export class AnimationController {
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
