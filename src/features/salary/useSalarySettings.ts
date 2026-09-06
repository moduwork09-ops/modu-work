import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { loadSalarySettings, saveSalarySettings } from './salaryStorage';
import type { SalarySettings } from './salaryTypes';

/** A focus/owner change invalidates both reads and save completions. */
export function useSalarySettings() {
  const { session } = useAuth();
  const owner = session?.user.id ?? null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const revision = useRef(0);
  const lock = useRef(false);
  const [loaded, setLoaded] = useState<{ owner: string; value: SalarySettings } | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  useFocusEffect(useCallback(() => {
    const ticket = ++revision.current;
    setLoaded(null);
    setFailed(false);
    lock.current = false;
    setSaving(false);
    if (owner) void loadSalarySettings(owner).then(result => {
      if (revision.current !== ticket || currentOwner.current !== owner) return;
      if (result.status === 'ready') setLoaded({ owner, value: result.settings });
      else setFailed(true);
    });
    return () => { ++revision.current; };
  }, [owner]));
  const settings = loaded?.owner === owner ? loaded.value : null;
  const setSettings = (update: (value: SalarySettings) => SalarySettings) => {
    setLoaded(previous => previous?.owner === owner ? { owner: previous.owner, value: update(previous.value) } : previous);
  };
  const save = async (next: SalarySettings) => {
    if (!owner || currentOwner.current !== owner || !settings || lock.current) return false;
    const ticket = revision.current;
    lock.current = true;
    setSaving(true);
    try {
      await saveSalarySettings(owner, next);
      if (revision.current !== ticket || currentOwner.current !== owner) return false;
      setLoaded({ owner, value: next });
      return true;
    } catch (error) {
      if (revision.current === ticket && currentOwner.current === owner) throw error;
      return false;
    } finally {
      if (revision.current === ticket && currentOwner.current === owner) {
        lock.current = false;
        setSaving(false);
      }
    }
  };
  return { settings, setSettings, failed, saving, save };
}
