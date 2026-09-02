import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_CALENDAR_DISPLAY_SETTINGS, type CalendarDisplaySettings } from './calendarDisplaySettings';
import { calendarDisplaySettingsStore } from './calendarDisplaySettingsStorage';

export function useCalendarDisplaySettings() {
  const { session } = useAuth();
  const owner = session?.user.id;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const generation = useRef(0);
  const lock = useRef(false);
  const [state, setState] = useState<{ owner?: string; settings: CalendarDisplaySettings; ready: boolean }>({ settings: DEFAULT_CALENDAR_DISPLAY_SETTINGS, ready: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setError(false);
    setState(previous => ({ owner, settings: previous.owner === owner ? previous.settings : DEFAULT_CALENDAR_DISPLAY_SETTINGS, ready: false }));
    if (!owner) return;
    try {
      const settings = await calendarDisplaySettingsStore.load(owner);
      if (request === generation.current && owner === ownerRef.current) setState({ owner, settings, ready: true });
    } catch { if (request === generation.current && owner === ownerRef.current) setError(true); }
  }, [owner]);
  useFocusEffect(useCallback(() => { void reload(); return () => { generation.current++; }; }, [reload]));
  const settings = state.owner === owner ? state.settings : DEFAULT_CALENDAR_DISPLAY_SETTINGS;
  const ready = state.owner === owner && state.ready;
  const update = async (patch: Partial<CalendarDisplaySettings>) => {
    if (!owner || !ready || lock.current) return false;
    lock.current = true; setSaving(true);
    const request = generation.current;
    try {
      const next = await calendarDisplaySettingsStore.save(owner, { ...settings, ...patch });
      if (request === generation.current && owner === ownerRef.current) setState({ owner, settings: next, ready: true });
      return true;
    } catch { return false; }
    finally { lock.current = false; setSaving(false); }
  };
  return { settings, ready, saving, error, reload, update };
}
