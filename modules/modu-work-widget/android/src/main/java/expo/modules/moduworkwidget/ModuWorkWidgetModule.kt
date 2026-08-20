package expo.modules.moduworkwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ModuWorkWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ModuWorkWidget")

    AsyncFunction("saveSnapshotAsync") { snapshot: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      WidgetStorage.saveSnapshot(context, snapshot)
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, ModuWorkWidgetProvider::class.java)
      ModuWorkWidgetProvider.updateWidgets(context, manager, manager.getAppWidgetIds(component))
    }
  }
}
