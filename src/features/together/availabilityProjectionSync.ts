import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { supabase } from '../../lib/supabase';
import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
import { getAuthenticatedUserId } from './togetherServerData';
import { createAvailabilityProjectionSyncCoordinator, FullAvailabilitySyncRequiredError, type AvailabilityProjectionRange, type AvailabilitySourceSnapshot } from './availabilityProjectionSyncCoordinator';
import { AVAILABILITY_PROJECTION_SYNC_QUEUE_KEY, createAvailabilityProjectionSyncQueueStore } from './availabilityProjectionSyncQueue';

function toDays(days: AvailabilityProjectionRange['days']) {
  return days.map((day) => ({ local_date: day.localDate, intervals: day.intervals.map((interval) => ({ start_minute: interval.startMinute, end_minute: interval.endMinute })) }));
}

async function fullSync(range: AvailabilityProjectionRange) {
  const { error } = await supabase.rpc('sync_my_availability_projection_range', {
    p_from: range.rangeStart, p_to: range.rangeEnd, p_timezone_name: range.timezoneName, p_days: toDays(range.days),
  });
  if (error) throw error;
}

async function replaceDates(timezoneName: string, days: AvailabilityProjectionRange['days']) {
  const { error } = await supabase.rpc('replace_my_availability_projection_days', {
    p_timezone_name: timezoneName, p_days: toDays(days),
  });
  if (error) {
    if (error.code === '55000' || error.message.includes('Full availability sync is required')) throw new FullAvailabilitySyncRequiredError();
    throw error;
  }
}

export async function clearMyAvailabilityProjections() {
  const { error } = await supabase.rpc('clear_my_availability_projections');
  if (error) throw error;
}

const queueStore = createAvailabilityProjectionSyncQueueStore(AsyncStorage, (owner) => getUserScopedStorageKey(owner, AVAILABILITY_PROJECTION_SYNC_QUEUE_KEY));
const coordinator = createAvailabilityProjectionSyncCoordinator({
  queueStore,
  getCurrentUserId: async () => { try { return await getAuthenticatedUserId(); } catch { return null; } },
  fullSync,
  replaceDates,
  getTimezoneName: getDeviceIanaTimezoneName,
});
let activeOwner: string | undefined;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | undefined;

export function getDeviceIanaTimezoneName() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone || typeof timezone !== 'string') return null;
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return timezone;
  } catch { return null; }
}

export function setAvailabilityProjectionSource(owner: string, source: AvailabilitySourceSnapshot) { coordinator.setSource(owner, source); }
export function activateAvailabilityProjectionSync(owner: string) {
  activeOwner = owner;
  coordinator.setForeground(AppState.currentState === 'active');
  coordinator.activate(owner);
  if (!appStateSubscription) appStateSubscription = AppState.addEventListener('change', (state) => coordinator.setForeground(state === 'active'));
  return () => {
    if (activeOwner !== owner) return;
    coordinator.deactivate(owner); activeOwner = undefined;
    appStateSubscription?.remove(); appStateSubscription = undefined;
  };
}
export async function enqueueAvailabilityProjectionDates(owner: string, dates: readonly unknown[]) {
  try { return await coordinator.enqueueDates(owner, dates); } catch { return false; }
}
export async function scheduleFullAvailabilityProjectionSync(owner: string) {
  try { return await coordinator.scheduleFull(owner); } catch { return false; }
}
