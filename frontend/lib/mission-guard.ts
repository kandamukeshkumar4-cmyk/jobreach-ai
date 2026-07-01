import type { MissionOut } from '@/lib/types';

type MissionLike = Pick<MissionOut, 'id' | 'status'> &
  Partial<Pick<MissionOut, 'title' | 'created_at'>>;

export const ACTIVE_MISSION_MESSAGE =
  'One mission is already running. You cannot start another until it finishes.';

export function findActiveMission(
  missions: MissionLike[] | null | undefined,
): MissionLike | null {
  return (
    missions?.find(
      (mission) => mission.status === 'pending' || mission.status === 'running',
    ) ?? null
  );
}

export function activeMissionBanner(
  missions: MissionLike[] | null | undefined,
) {
  const mission = findActiveMission(missions);
  if (!mission) return null;
  return {
    mission,
    title: 'One mission at a time',
    message: ACTIVE_MISSION_MESSAGE,
  };
}

export function missionCreateErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (raw.startsWith('409')) return ACTIVE_MISSION_MESSAGE;
  return raw || 'Failed to launch mission. Please try again.';
}
