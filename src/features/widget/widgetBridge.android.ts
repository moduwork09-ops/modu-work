import ModuWorkWidget from '../../../modules/modu-work-widget';

import type { MonthlyWidgetSnapshot } from './monthlyWidgetSnapshot';

export async function syncMonthlyWidgetSnapshot(snapshot: MonthlyWidgetSnapshot) {
  await ModuWorkWidget.saveSnapshotAsync(JSON.stringify(snapshot));
}
