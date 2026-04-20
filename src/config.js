/**
 * config.js
 * Central configuration - levels, snap threshold, asset paths.
 * SOC Security Training: Security Control System
 */

export const SNAP_THRESHOLD = 80;        // desktop px
export const SNAP_THRESHOLD_TOUCH = 120; // touch px (much more forgiving)

export const LEVELS = [
  {
    id: 1,
    label: 'Module 1',
    topic: 'Unauthorized Access',
    threat: 'ELEVATED',
    points: 20,           // base points earned on completion
    targetTime: 30,       // seconds before overtime kicks in
    penaltyEvery: 10,     // deduct every N overtime seconds
    penaltyAmount: 5,     // points deducted per interval
    grid: { cols: 3, rows: 2 },
    image: 'assets/images/Phisical security/level1.png',
    video: 'assets/videos/level1.mp4',
    objective: 'Restore the failed-access scene and reconnect the safe authentication sequence.',
    hint: 'Start with the most recognizable corners, then close the gaps in the center.',
    tip: `
Unauthorized access attempts are often the first sign of a security breach.
If a system denies access, it means authentication has failed - do not try to bypass controls.

- Always use valid credentials
- Never share login access
- Report repeated access failures immediately
    `,
  },
  {
    id: 2,
    label: 'Module 2',
    topic: 'Physical Security (Tailgating)',
    threat: 'HIGH',
    points: 30,
    targetTime: 60,
    penaltyEvery: 10,
    penaltyAmount: 5,
    grid: { cols: 4, rows: 3 },
    image: 'assets/images/Phisical security/level2.png',
    video: 'assets/videos/level2.mp4',
    objective: 'Complete the highest-priority board and lock the physical access story back into place.',
    hint: 'Edge pieces and repeating doorway shapes help anchor the final board faster.',
    tip: `
Tailgating is a physical security breach where an unauthorized person follows an authorized user.

- Never allow someone to enter behind you without authentication
- Always badge individually
- Challenge unknown individuals politely
- Report suspicious access immediately

Physical security is cybersecurity's first layer.
    `,
  },
  {
    id: 3,
    label: 'Module 3',
    topic: 'Zero Trust & MFA',
    threat: 'CRITICAL',
    points: 50,
    targetTime: 90,
    penaltyEvery: 10,
    penaltyAmount: 5,
    grid: { cols: 5, rows: 4 },
    image: 'assets/images/Phisical security/level3.png',
    video: 'assets/videos/level3.mp4',
    objective: 'Rebuild the verification path so identity, device, and access checks line up correctly.',
    hint: 'Use the stronger color and shape landmarks first, then match the smaller verification slices.',
    tip: `
Zero Trust means: trust nothing, verify everything.

- Every user, device, and request must be validated
- Multi-Factor Authentication (MFA) adds an extra security layer
- Location and device checks help detect anomalies

Never assume access - always verify identity.
    `,
  },
];

/** Ensures runtime level config matches canonical module id → assets (guardrail for lazy loading). */
export function levelAssetsAreCanonical(levelCfg) {
  const row = LEVELS.find((l) => l.id === levelCfg.id);
  return Boolean(row && row.video === levelCfg.video && row.image === levelCfg.image);
}
