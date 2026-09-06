package expo.modules.moduworkwidget

enum class WidgetMode { TODAY, THREE_DAY, MONTH }

object WidgetLayoutPolicy {
  const val MONTH_HEADER_HEIGHT_DP = 48
  const val MIN_CONTENT_HEIGHT_DP = 96

  fun contentHeightDp(heightDp: Int, mode: WidgetMode): Int =
    (heightDp - if (mode == WidgetMode.MONTH) MONTH_HEADER_HEIGHT_DP else 0)
      .coerceAtLeast(MIN_CONTENT_HEIGHT_DP)
}
