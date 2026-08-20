package expo.modules.moduworkwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class ModuWorkWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    updateWidgets(context, manager, widgetIds)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, widgetId: Int, newOptions: android.os.Bundle) {
    updateWidgets(context, manager, intArrayOf(widgetId))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return

    val currentOffset = WidgetStorage.getMonthOffset(context, widgetId)
    when (intent.action) {
      ACTION_PREVIOUS -> WidgetStorage.setMonthOffset(context, widgetId, currentOffset - 1)
      ACTION_NEXT -> WidgetStorage.setMonthOffset(context, widgetId, currentOffset + 1)
      ACTION_REFRESH -> Unit
      else -> return
    }
    updateWidgets(context, AppWidgetManager.getInstance(context), intArrayOf(widgetId))
  }

  override fun onDeleted(context: Context, widgetIds: IntArray) {
    widgetIds.forEach { WidgetStorage.deleteWidget(context, it) }
  }

  companion object {
    const val ACTION_PREVIOUS = "expo.modules.moduworkwidget.PREVIOUS_MONTH"
    const val ACTION_NEXT = "expo.modules.moduworkwidget.NEXT_MONTH"
    const val ACTION_REFRESH = "expo.modules.moduworkwidget.REFRESH"

    fun updateWidgets(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
      widgetIds.forEach { widgetId ->
        val views = RemoteViews(context.packageName, R.layout.modu_work_widget)
        val offset = WidgetStorage.getMonthOffset(context, widgetId)
        val options = manager.getAppWidgetOptions(widgetId)
        val widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 300)
        val heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 360)
        val rendered = WidgetRenderer.render(context, WidgetStorage.loadSnapshot(context), offset, widthDp, heightDp - 48)

        views.setTextViewText(R.id.widget_title, rendered.title)
        views.setImageViewBitmap(R.id.widget_calendar, rendered.bitmap)
        views.setOnClickPendingIntent(R.id.widget_previous, actionIntent(context, widgetId, ACTION_PREVIOUS, 1))
        views.setOnClickPendingIntent(R.id.widget_next, actionIntent(context, widgetId, ACTION_NEXT, 2))
        views.setOnClickPendingIntent(R.id.widget_refresh, actionIntent(context, widgetId, ACTION_REFRESH, 3))
        views.setOnClickPendingIntent(R.id.widget_calendar, openCalendarIntent(context, widgetId))
        manager.updateAppWidget(widgetId, views)
      }
    }

    private fun actionIntent(context: Context, widgetId: Int, action: String, actionCode: Int): PendingIntent {
      val intent = Intent(context, ModuWorkWidgetProvider::class.java).apply {
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

    private fun openCalendarIntent(context: Context, widgetId: Int): PendingIntent {
      val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("teum://calendar")).apply {
        setPackage(context.packageName)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      return PendingIntent.getActivity(
        context,
        widgetId * 10 + 4,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}
