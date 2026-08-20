package expo.modules.moduworkwidget

import android.content.Context

object WidgetStorage {
  private const val PREFERENCES = "modu_work_widget"
  private const val SNAPSHOT_KEY = "monthly_snapshot"

  fun saveSnapshot(context: Context, snapshot: String) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putString(SNAPSHOT_KEY, snapshot)
      .apply()
  }

  fun loadSnapshot(context: Context): String? =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getString(SNAPSHOT_KEY, null)

  fun getMonthOffset(context: Context, widgetId: Int): Int =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getInt("month_offset_$widgetId", 0)

  fun setMonthOffset(context: Context, widgetId: Int, offset: Int) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putInt("month_offset_$widgetId", offset.coerceIn(-12, 12))
      .apply()
  }

  fun deleteWidget(context: Context, widgetId: Int) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .remove("month_offset_$widgetId")
      .apply()
  }
}
