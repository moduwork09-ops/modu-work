import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMonthlyMemoStore } from './monthlyMemo';
export const monthlyMemoStore = createMonthlyMemoStore(AsyncStorage);
