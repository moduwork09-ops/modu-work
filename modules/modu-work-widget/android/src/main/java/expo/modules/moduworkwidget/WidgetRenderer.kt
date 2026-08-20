package expo.modules.moduworkwidget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import org.json.JSONArray
import org.json.JSONObject

data class RenderedWidget(val title: String, val bitmap: Bitmap)

object WidgetRenderer {
  private const val BACKGROUND = "#FFFFFF"
  private const val WEEKDAY = "#343A40"
  private const val SUNDAY = "#D9363E"
  private const val SATURDAY = "#1976D2"

  fun render(context: Context, snapshotJson: String?, offset: Int, widthDp: Int, heightDp: Int): RenderedWidget {
    val density = context.resources.displayMetrics.density
    val width = (widthDp.coerceIn(220, 600) * density).toInt().coerceAtMost(560)
    val height = (heightDp.coerceIn(240, 720) * density).toInt().coerceAtMost(760)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
    val canvas = Canvas(bitmap)
    canvas.drawColor(parseColor(BACKGROUND, Color.WHITE))

    val snapshot = try { snapshotJson?.let(::JSONObject) } catch (_: Exception) { null }
    val months = snapshot?.optJSONArray("months")
    val month = findMonth(months, offset)
    if (month == null) {
      drawEmpty(canvas, width, height, density)
      return RenderedWidget("모두의 근무", bitmap)
    }

    drawCalendar(canvas, month, width, height, density)
    return RenderedWidget(month.optString("label", "모두의 근무"), bitmap)
  }

  private fun findMonth(months: JSONArray?, offset: Int): JSONObject? {
    if (months == null) return null
    for (index in 0 until months.length()) {
      val month = months.optJSONObject(index) ?: continue
      if (month.optInt("offset", Int.MIN_VALUE) == offset) return month
    }
    return null
  }

  private fun drawEmpty(canvas: Canvas, width: Int, height: Int, density: Float) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#6B7280", Color.DKGRAY)
      textAlign = Paint.Align.CENTER
      textSize = 14f * density
    }
    canvas.drawText("앱을 열어 위젯 데이터를 동기화해주세요.", width / 2f, height / 2f, paint)
  }

  private fun drawCalendar(canvas: Canvas, month: JSONObject, width: Int, height: Int, density: Float) {
    val weekdays = arrayOf("일", "월", "화", "수", "목", "금", "토")
    val cells = month.optJSONArray("cells") ?: JSONArray()

    val widthScale = width / 560f
    val heightScale = height / 760f
    val scale = minOf(widthScale, heightScale).coerceAtLeast(0.72f)
    // Geometry must continue to fit all six rows. Visual elements use the
    // historical widget scale independently so text stays readable.
    val visualScale = minOf(width / 350f, height / 500f).coerceIn(1f, 1.6f)

    val horizontalPadding = 7f * scale
    val weekdayHeight = 38f * scale
    val cellWidth = (width - horizontalPadding * 2) / 7f
    val cellHeight = (height - weekdayHeight) / 6f

    val weekdayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textAlign = Paint.Align.CENTER
      textSize = (13f * visualScale).coerceIn(16f, 20.8f)
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }

    weekdays.forEachIndexed { index, label ->
      weekdayPaint.color = when (index) {
        0 -> parseColor(SUNDAY, Color.RED)
        6 -> parseColor(SATURDAY, Color.BLUE)
        else -> parseColor("#5F6873", Color.GRAY)
      }
      canvas.drawText(
        label,
        horizontalPadding + cellWidth * (index + 0.5f),
        24f * scale,
        weekdayPaint
      )
    }

    val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#EEF1F4", Color.LTGRAY)
      strokeWidth = maxOf(1f, 1f * scale)
    }

    for (row in 0..6) {
      val y = weekdayHeight + row * cellHeight
      canvas.drawLine(horizontalPadding, y, width - horizontalPadding, y, dividerPaint)
    }

    for (index in 0 until minOf(42, cells.length())) {
      val cell = cells.optJSONObject(index) ?: continue
      val column = index % 7
      val row = index / 7
      val left = horizontalPadding + column * cellWidth
      val top = weekdayHeight + row * cellHeight
      drawCell(canvas, cell, left, top, cellWidth, cellHeight, scale, visualScale)
    }
  }

  private fun drawCell(
    canvas: Canvas,
    cell: JSONObject,
    left: Float,
    top: Float,
    width: Float,
    height: Float,
    scale: Float,
    visualScale: Float
  ) {
    val inMonth = cell.optBoolean("inMonth", false)
    val alpha = if (inMonth) 255 else 92
    val centerX = left + width / 2f

    val dateBaseline = top + height * 0.19f
    val badgeTop = top + height * 0.265f
    val badgeHeight = minOf(height * 0.29f, (18f * visualScale).coerceIn(24f, 30f))
    val scheduleTop = top + height * 0.64f

    val datePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = when (cell.optString("dateKind")) {
        "holiday", "sunday" -> parseColor(SUNDAY, Color.RED)
        "saturday" -> parseColor(SATURDAY, Color.BLUE)
        else -> parseColor(WEEKDAY, Color.DKGRAY)
      }
      this.alpha = alpha
      textAlign = Paint.Align.CENTER
      textSize = (13f * visualScale).coerceIn(16f, 20.8f)
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }

    if (cell.optBoolean("isToday", false)) {
      val todayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = parseColor("#FFF1C7", Color.YELLOW)
        this.alpha = if (inMonth) 230 else 110
      }
      val radius = minOf(width * 0.18f, 12f * scale)
      canvas.drawCircle(centerX, dateBaseline - 4.5f * scale, radius, todayPaint)
    }

    canvas.drawText(cell.optInt("day").toString(), centerX, dateBaseline, datePaint)

    val shift = cell.optJSONObject("shift")
    if (shift != null) {
      val abbreviation = shift.optString("abbreviation")
      val badgeWidth = minOf(
        width - 7f * scale,
        maxOf(
          (28f * visualScale).coerceIn(42f, 46f),
          (abbreviation.length * 12f + 18f) * visualScale
        )
      )

      val badgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = parseColor(
          shift.optString("backgroundColor"),
          parseColor("#FFF640", Color.YELLOW)
        )
        this.alpha = alpha
      }

      canvas.drawRoundRect(
        RectF(
          centerX - badgeWidth / 2f,
          badgeTop,
          centerX + badgeWidth / 2f,
          badgeTop + badgeHeight
        ),
        6.8f * scale,
        6.8f * scale,
        badgePaint
      )

      val badgeText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = parseColor(shift.optString("textColor"), Color.BLACK)
        this.alpha = alpha
        textAlign = Paint.Align.CENTER
        textSize = (11.5f * visualScale).coerceIn(14f, 18.4f)
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
      }

      val fm = badgeText.fontMetrics
      val badgeTextBaseline =
        badgeTop + badgeHeight / 2f - (fm.ascent + fm.descent) / 2f
      canvas.drawText(abbreviation, centerX, badgeTextBaseline, badgeText)
    }

    val items = cell.optJSONArray("items") ?: JSONArray()
    val itemPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#252A31", Color.DKGRAY)
      this.alpha = alpha
      textSize = (9.5f * visualScale).coerceIn(11.5f, 15.2f)
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }

    val availableWidth = width - 8f * scale
    val lineHeight = maxOf(16.2f * scale, 18f * visualScale)
    val barHeight = maxOf(15.5f * scale, 17f * visualScale).coerceAtMost(height * 0.18f)
    val accentWidth = 3.0f * scale

    val maxLines =
      if (height - (scheduleTop - top) >= 33f * scale) 2 else 1

    for (line in 0 until minOf(maxLines, items.length())) {
      val item = items.optJSONObject(line) ?: continue
      val itemColor = parseColor(
        item.optString("color"),
        parseColor("#D7DCE2", Color.LTGRAY)
      )
      val barTop = scheduleTop + line * lineHeight - 10f * scale
      val barLeft = left + 4f * scale
      val barRight = left + width - 4f * scale

      val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = itemColor
        this.alpha = if (inMonth) 96 else 38
      }

      canvas.drawRoundRect(
        RectF(barLeft, barTop, barRight, barTop + barHeight),
        3.2f * scale,
        3.2f * scale,
        barPaint
      )

      val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = itemColor
        this.alpha = alpha
      }

      canvas.drawRoundRect(
        RectF(
          barLeft,
          barTop,
          barLeft + accentWidth,
          barTop + barHeight
        ),
        1.3f * scale,
        1.3f * scale,
        accentPaint
      )

      val remaining = items.length() - maxLines + 1
      val value =
        if (line == maxLines - 1 && remaining > 1)
          "${item.optString("text")} +${remaining - 1}"
        else
          item.optString("text")

      val text = ellipsize(value, itemPaint, availableWidth - 9.5f * scale)
      val fm = itemPaint.fontMetrics
      val textBaseline =
        barTop + barHeight / 2f - (fm.ascent + fm.descent) / 2f

      canvas.drawText(
        text,
        barLeft + 6.5f * scale,
        textBaseline,
        itemPaint
      )
    }
  }

  private fun ellipsize(value: String, paint: Paint, maxWidth: Float): String {
    if (paint.measureText(value) <= maxWidth) return value
    val suffix = "…"
    val count = paint.breakText(
      value,
      true,
      (maxWidth - paint.measureText(suffix)).coerceAtLeast(0f),
      null
    )
    return value.take(count.coerceAtLeast(0)) + suffix
  }

  private fun parseColor(value: String?, fallback: Int): Int = try {
    if (value.isNullOrBlank()) fallback else Color.parseColor(value)
  } catch (_: IllegalArgumentException) {
    fallback
  }
}
