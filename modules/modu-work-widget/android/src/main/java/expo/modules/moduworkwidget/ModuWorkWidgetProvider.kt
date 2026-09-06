package expo.modules.moduworkwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews

data class WidgetProviderEntry(
  val providerClass: Class<out AppWidgetProvider>,
  val mode: WidgetMode,
)

object WidgetProviderRegistry {
  val entries = listOf(
    WidgetProviderEntry(ModuWorkTodayWidgetProvider::class.java, WidgetMode.TODAY),
    WidgetProviderEntry(ModuWorkThreeDayWidgetProvider::class.java, WidgetMode.THREE_DAY),
    WidgetProviderEntry(ModuWorkWidgetProvider::class.java, WidgetMode.MONTH),
  )
}

object ModuWorkWidgetUpdater {
  fun updateAll(context: Context, manager: AppWidgetManager = AppWidgetManager.getInstance(context)) {
    WidgetProviderRegistry.entries.forEach { entry ->
      val widgetIds = manager.getAppWidgetIds(ComponentName(context, entry.providerClass))
      updateWidgets(context, manager, widgetIds, entry.providerClass, entry.mode)
    }
  }

  fun updateWidgets(
    context: Context,
    manager: AppWidgetManager,
    widgetIds: IntArray,
    providerClass: Class<out AppWidgetProvider>,
    mode: WidgetMode,
  ) {
    widgetIds.forEach { widgetId ->
      val views = RemoteViews(context.packageName, R.layout.modu_work_widget)
      val offset = WidgetStorage.getMonthOffset(context, widgetId)
      val options = manager.getAppWidgetOptions(widgetId)
      val defaultWidth = when (mode) {
        WidgetMode.TODAY -> 110
        WidgetMode.THREE_DAY -> 250
        WidgetMode.MONTH -> 300
      }
      val defaultHeight = when (mode) {
        WidgetMode.TODAY, WidgetMode.THREE_DAY -> 110
        WidgetMode.MONTH -> 360
      }
      val widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, defaultWidth)
      val heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, defaultHeight)
      val rendered = WidgetRenderer.render(
        context,
        WidgetStorage.loadSnapshot(context),
        offset,
        widthDp,
        WidgetLayoutPolicy.contentHeightDp(heightDp, mode),
        mode,
      )
      val monthControlsVisibility = if (mode == WidgetMode.MONTH) View.VISIBLE else View.GONE

      views.setViewVisibility(R.id.widget_header, monthControlsVisibility)
      views.setTextViewText(R.id.widget_title, rendered.title)
      views.setImageViewBitmap(R.id.widget_calendar, rendered.bitmap)
      views.setContentDescription(R.id.widget_calendar, when (mode) {
        WidgetMode.TODAY -> "오늘의 근무"
        WidgetMode.THREE_DAY -> "오늘부터 3일간의 근무"
        WidgetMode.MONTH -> "월간 근무 캘린더"
      })
      views.setOnClickPendingIntent(R.id.widget_previous, actionIntent(context, providerClass, widgetId, BaseModuWorkWidgetProvider.ACTION_PREVIOUS, 1))
      views.setOnClickPendingIntent(R.id.widget_next, actionIntent(context, providerClass, widgetId, BaseModuWorkWidgetProvider.ACTION_NEXT, 2))
      views.setOnClickPendingIntent(R.id.widget_refresh, actionIntent(context, providerClass, widgetId, BaseModuWorkWidgetProvider.ACTION_REFRESH, 3))
      views.setOnClickPendingIntent(R.id.widget_calendar, openCalendarIntent(context, widgetId, mode))
      manager.updateAppWidget(widgetId, views)
    }
  }

  private fun actionIntent(
    context: Context,
    providerClass: Class<out AppWidgetProvider>,
    widgetId: Int,
    action: String,
    actionCode: Int,
  ): PendingIntent {
    val intent = Intent(context, providerClass).apply {
      this.action = action
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
    }
    return PendingIntent.getBroadcast(
      context,
      widgetId * 10 + actionCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun openCalendarIntent(context: Context, widgetId: Int, mode: WidgetMode): PendingIntent {
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("teum://calendar")).apply {
      setPackage(context.packageName)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    return PendingIntent.getActivity(
      context,
      widgetId * 10 + 4 + mode.ordinal,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}

abstract class BaseModuWorkWidgetProvider(
  private val mode: WidgetMode,
) : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    ModuWorkWidgetUpdater.updateWidgets(context, manager, widgetIds, javaClass, mode)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    widgetId: Int,
    newOptions: android.os.Bundle,
  ) {
    ModuWorkWidgetUpdater.updateWidgets(context, manager, intArrayOf(widgetId), javaClass, mode)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (mode != WidgetMode.MONTH) return
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return

    val currentOffset = WidgetStorage.getMonthOffset(context, widgetId)
    when (intent.action) {
      ACTION_PREVIOUS -> WidgetStorage.setMonthOffset(context, widgetId, currentOffset - 1)
      ACTION_NEXT -> WidgetStorage.setMonthOffset(context, widgetId, currentOffset + 1)
      ACTION_REFRESH -> Unit
      else -> return
    }
    ModuWorkWidgetUpdater.updateWidgets(context, AppWidgetManager.getInstance(context), intArrayOf(widgetId), javaClass, mode)
  }

  override fun onDeleted(context: Context, widgetIds: IntArray) {
    widgetIds.forEach { WidgetStorage.deleteWidget(context, it) }
  }

  companion object {
    const val ACTION_PREVIOUS = "expo.modules.moduworkwidget.PREVIOUS_MONTH"
    const val ACTION_NEXT = "expo.modules.moduworkwidget.NEXT_MONTH"
    const val ACTION_REFRESH = "expo.modules.moduworkwidget.REFRESH"
  }
}

class ModuWorkTodayWidgetProvider : BaseModuWorkWidgetProvider(WidgetMode.TODAY)

class ModuWorkThreeDayWidgetProvider : BaseModuWorkWidgetProvider(WidgetMode.THREE_DAY)

// Keep the original receiver identity so existing installed widgets remain valid.
class ModuWorkWidgetProvider : BaseModuWorkWidgetProvider(WidgetMode.MONTH)
