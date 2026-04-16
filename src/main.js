/**
 * main.js
 * Application entry point. Boots the GameManager and maintains mobile viewport height.
 * SOC Security Training: Security Control System
 */

import { GameManager } from './gameManager.js';

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
