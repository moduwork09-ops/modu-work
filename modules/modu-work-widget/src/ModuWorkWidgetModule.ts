import { requireNativeModule } from 'expo';

declare class ModuWorkWidgetModule {
  saveSnapshotAsync(snapshot: string): Promise<void>;
}

export default requireNativeModule<ModuWorkWidgetModule>('ModuWorkWidget');
