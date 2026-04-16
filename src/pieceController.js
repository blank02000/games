/**
 * pieceController.js
 * Manages drag-and-drop interactions for puzzle pieces using Pointer Events.
 * SOC Security Training: Security Control System
 */

import { SNAP_THRESHOLD, SNAP_THRESHOLD_TOUCH } from './config.js';

export class PieceController {
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
