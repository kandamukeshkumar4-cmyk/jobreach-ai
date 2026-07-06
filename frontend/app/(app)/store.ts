import { create } from 'zustand'

interface AppStore {
  activeMissionId: string | null
  missionStatus: 'idle' | 'running' | 'completed' | 'failed'
  setActiveMission: (id: string) => void
  activeProfileId: string | null
  setActiveProfile: (id: string | null) => void
  runningMissions: number
  setRunningMissions: (n: number) => void
}

export const useAppStore = create<AppStore>((set) => ({
  activeMissionId: null,
  missionStatus: 'idle',
  setActiveMission: (id) => set({ activeMissionId: id }),
  activeProfileId: null,
  setActiveProfile: (id) => set({ activeProfileId: id }),
  runningMissions: 0,
  setRunningMissions: (n) => set({ runningMissions: n }),
}))
