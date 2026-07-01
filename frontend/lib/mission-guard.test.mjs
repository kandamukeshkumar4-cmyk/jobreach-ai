import {
  ACTIVE_MISSION_MESSAGE,
  activeMissionBanner,
  findActiveMission,
  missionCreateErrorMessage,
} from './mission-guard.ts';

const results = [];

function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail && !ok ? ` - ${detail}` : ''}`);
}

const missions = [
  { id: 'done', title: 'done', status: 'completed', created_at: '2026-07-01T00:00:00Z' },
  { id: 'running', title: 'AI engineer', status: 'running', created_at: '2026-07-01T00:01:00Z' },
];

check('findActiveMission returns the running mission',
  findActiveMission(missions)?.id === 'running',
  JSON.stringify(findActiveMission(missions)));

check('activeMissionBanner returns a banner when one mission is active',
  activeMissionBanner(missions)?.message === ACTIVE_MISSION_MESSAGE,
  JSON.stringify(activeMissionBanner(missions)));

check('activeMissionBanner is null when all missions are terminal',
  activeMissionBanner([{ id: 'done', status: 'completed' }]) === null);

check('409 mission create errors map to the same banner message',
  missionCreateErrorMessage(new Error('409 {"detail":"A mission is already running"}')) === ACTIVE_MISSION_MESSAGE);

check('non-409 errors preserve backend detail',
  missionCreateErrorMessage(new Error('500 backend unavailable')) === '500 backend unavailable');

const passed = results.filter(Boolean).length;
const failed = results.length - passed;
console.log(`\n=== ${passed}/${results.length} mission guard checks passed ===`);
process.exit(failed ? 1 : 0);
