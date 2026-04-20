/**
 * puzzleManager.js
 * Builds the puzzle grid, creates sliced pieces, shuffles them,
 * and tracks completion progress.
 * SOC Security Training: Security Control System
 */

export class PuzzleManager {
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
