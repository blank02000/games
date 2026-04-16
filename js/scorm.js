/**
 * scorm.js
 * SCORM 1.2 integration layer for the Cyber Defense Puzzle game.
 *
 * Depends on:
 *   - scrom_api_wrapper.js  (pipwerks SCORM API wrapper, loaded before this file)
 *   - bundle.js             (fires custom DOM events: game:start, game:levelComplete, game:complete)
 *
 * Scoring:
 *   Module 1 = 20 pts  |  Module 2 = 30 pts  |  Module 3 = 50 pts  |  MAX = 100
 *   Passing threshold = 60% = 60 / 100
 *
 * SCORM fields written:
 *   cmi.core.score.raw   – numeric score 0-100
 *   cmi.core.score.min   – 0
 *   cmi.core.score.max   – 100
 *   cmi.core.lesson_status – "passed" | "failed" | "incomplete"
 *
 * External API:
 *   POST https://prophish.progist.net/api/campaign/checkForm
 */

(function () {
  'use strict';

  /* ─── Constants ──────────────────────────────────────────── */
  const MAX_SCORE   = 100;
  const PASS_PCT    = 60;           // 60 % passing threshold
  const PASS_SCORE  = MAX_SCORE * PASS_PCT / 100;  // = 60

  const API_ENDPOINT = 'https://prophish.progist.net/api/campaign/checkForm';
  const QUIZ_TITLE   = 'Cyber Defense: Security Puzzle';

  /* ─── State ──────────────────────────────────────────────── */
  let _scormActive  = false;
  let _finalScore   = 0;
  let _submitted    = false;   // prevents duplicate API + SCORM saves

  /* ─── SCORM helpers ─────────────────────────────────────── */

  function scormInit() {
    try {
      const ok = pipwerks.SCORM.init();
      _scormActive = ok;
      if (ok) {
        console.log('[SCORM] Session initialised.');
        // Mark as incomplete while the learner is playing
        pipwerks.SCORM.set('cmi.core.lesson_status', 'incomplete');
        pipwerks.SCORM.save();
      } else {
        console.warn('[SCORM] LMS API not found – running in standalone mode.');
      }
    } catch (e) {
      console.warn('[SCORM] Init error:', e);
      _scormActive = false;
    }
  }

  function scormSaveProgress(score) {
    if (!_scormActive) return;
    try {
      pipwerks.SCORM.set('cmi.core.score.raw', String(score));
      pipwerks.SCORM.set('cmi.core.score.min', '0');
      pipwerks.SCORM.set('cmi.core.score.max', String(MAX_SCORE));
      pipwerks.SCORM.save();
    } catch (e) {
      console.warn('[SCORM] Save progress error:', e);
    }
  }

  function scormFinish(score) {
    if (!_scormActive) return;
    try {
      const status = score >= PASS_SCORE ? 'passed' : 'failed';
      pipwerks.SCORM.set('cmi.core.score.raw',    String(score));
      pipwerks.SCORM.set('cmi.core.score.min',    '0');
      pipwerks.SCORM.set('cmi.core.score.max',    String(MAX_SCORE));
      pipwerks.SCORM.set('cmi.core.lesson_status', status);
      pipwerks.SCORM.save();
      pipwerks.SCORM.quit();
      _scormActive = false;   // prevent duplicate quit on beforeunload
      console.log(`[SCORM] Session closed. Status: ${status}, Score: ${score}`);
    } catch (e) {
      console.warn('[SCORM] Finish error:', e);
    }
  }

  /* ─── External API submission ───────────────────────────── */

  function submitToAPI(score) {
    const percentScore = Math.round((score / MAX_SCORE) * 100);
    const status       = score >= PASS_SCORE ? 'Pass' : 'Failed';

    const payload = {
      'URL':              window.location.href,
      'Awarded Score':    score,
      'Passing Score':    PASS_SCORE,
      'Passing Percent':  PASS_PCT,
      'Awarded Percent':  percentScore,
      'Status':           status,
      'Quiz Title':       QUIZ_TITLE,
    };

    console.log('[API] Submitting score:', payload);

    fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => console.log('[API] Score accepted:', data))
      .catch((err) => console.warn('[API] Submission failed:', err.message));
  }

  /* ─── Combined finish (SCORM + API, called once) ─────────── */

  function handleGameComplete(score) {
    if (_submitted) return;
    _submitted  = true;
    _finalScore = score;

    submitToAPI(score);
    scormFinish(score);
  }

  /* ─── Game event listeners ──────────────────────────────── */

  // game:start → fired by bundle.js when the player clicks "Start Mission"
  document.addEventListener('game:start', function () {
    console.log('[SCORM] Game started.');
    _submitted  = false;
    _finalScore = 0;
  });

  // game:levelComplete → fired by bundle.js after every module is solved
  document.addEventListener('game:levelComplete', function (e) {
    const { levelLabel, levelPoints, runningScore } = e.detail;
    console.log(`[SCORM] Level complete – ${levelLabel} (+${levelPoints} pts) → running total: ${runningScore}`);
    scormSaveProgress(runningScore);
  });

  // game:complete → fired by bundle.js when ALL modules are finished
  document.addEventListener('game:complete', function (e) {
    const { score } = e.detail;
    console.log(`[SCORM] All modules complete. Final score: ${score} / ${MAX_SCORE}`);
    handleGameComplete(score);
  });

  /* ─── Safety net: save + quit if user closes tab mid-game ── */

  window.addEventListener('beforeunload', function () {
    if (_submitted) return;  // already handled cleanly

    if (_scormActive) {
      try {
        // Save whatever score we have so far
        pipwerks.SCORM.set('cmi.core.score.raw', String(_finalScore));
        pipwerks.SCORM.set('cmi.core.score.min', '0');
        pipwerks.SCORM.set('cmi.core.score.max', String(MAX_SCORE));
        // incomplete if not all modules done
        pipwerks.SCORM.set('cmi.core.lesson_status', 'incomplete');
        pipwerks.SCORM.save();
        pipwerks.SCORM.quit();
      } catch (_) { /* ignore */ }
    }
  });

  /* ─── Boot ───────────────────────────────────────────────── */

  // Initialise SCORM as soon as the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scormInit);
  } else {
    scormInit();
  }

  /* ─── Video mute / unmute button ─────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    const video    = document.getElementById('reward-video');
    const muteBtn  = document.getElementById('btn-video-mute');

    if (!video || !muteBtn) return;

    function syncMuteIcon() {
      muteBtn.textContent = video.muted ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
    }

    muteBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      // If unmuting while paused, try to play
      if (!video.muted && video.paused && video.src) {
        video.play().catch(() => {});
      }
      syncMuteIcon();
    });

    // Keep button in sync when browser changes muted state (e.g., autoplay policy)
    video.addEventListener('volumechange', syncMuteIcon);

    // Initialise icon state
    syncMuteIcon();
  });

})();
