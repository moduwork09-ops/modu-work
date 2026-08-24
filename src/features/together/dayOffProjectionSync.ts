import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
import type { DayOffProjectionScheduleSnapshot } from './dayOffProjectionSyncCoordinator';
import { createDayOffProjectionSyncCoordinator } from './dayOffProjectionSyncCoordinator';
import {
  createDayOffProjectionSyncQueueStore,
  DAY_OFF_PROJECTION_SYNC_QUEUE_KEY,
} from './dayOffProjectionSyncQueue';
import {
  clearMyDayOffProjections,
  getAuthenticatedUserId,
  getMyDayOffSyncCoverage,
  syncMyDayOffProjectionRange,
  upsertMyDayOffProjections,
} from './togetherServerData';

const queueStore = createDayOffProjectionSyncQueueStore(
  AsyncStorage,
  (ownerUserId) => getUserScopedStorageKey(ownerUserId, DAY_OFF_PROJECTION_SYNC_QUEUE_KEY),
);

const coordinator = createDayOffProjectionSyncCoordinator({
  queueStore,
  getCurrentUserId: async () => {
    try {
      return await getAuthenticatedUserId();
    } catch {
      return null;
    }
  },
  getCoverage: getMyDayOffSyncCoverage,
  upsert: upsertMyDayOffProjections,
  fullSync: syncMyDayOffProjectionRange,
  clear: clearMyDayOffProjections,
});

let activeOwnerUserId: string | undefined;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | undefined;

export function setDayOffProjectionSchedule(
  ownerUserId: string,
  schedule: DayOffProjectionScheduleSnapshot,
) {
  coordinator.setSchedule(ownerUserId, schedule);
}

export function activateDayOffProjectionSync(ownerUserId: string) {
  activeOwnerUserId = ownerUserId;
  coordinator.setForeground(AppState.currentState === 'active');
  coordinator.activate(ownerUserId);
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (state) => {
      coordinator.setForeground(state === 'active');
    });
  }
  return () => {
    if (activeOwnerUserId !== ownerUserId) return;
    coordinator.deactivate(ownerUserId);
    activeOwnerUserId = undefined;
    appStateSubscription?.remove();
    appStateSubscription = undefined;
  };
}

export async function enqueueDayOffProjectionDirtyDate(ownerUserId: string, localDate: string) {
  try {
    return await coordinator.enqueueDirtyDate(ownerUserId, localDate);
  } catch {
    return false;
  }
}

export async function requestFullDayOffProjectionSync(ownerUserId: string) {
  try {
    return await coordinator.requestFullSync(ownerUserId);
  } catch {
    return 'failed' as const;
  }
}
