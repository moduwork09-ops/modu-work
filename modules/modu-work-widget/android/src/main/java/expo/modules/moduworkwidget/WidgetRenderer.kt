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
import java.time.LocalDate

data class RenderedWidget(val title: String, val bitmap: Bitmap, val mode: WidgetMode)

object WidgetRenderer {
  private const val BACKGROUND = "#FFFFFF"
  private const val WEEKDAY = "#343A40"
  private const val SUNDAY = "#D9363E"
  private const val SATURDAY = "#1976D2"
  private val INFO_TIME_PREFIX = Regex("^\\d{2}:\\d{2} ")
  private val INFO_OVERFLOW_SUFFIX = Regex(" \\+\\d+$")

  fun render(context: Context, snapshotJson: String?, offset: Int, widthDp: Int, heightDp: Int, mode: WidgetMode): RenderedWidget {
    val density = context.resources.displayMetrics.density
    val width = (widthDp.coerceIn(96, 600) * density).toInt().coerceAtMost(560)
    val height = (heightDp.coerceIn(96, 720) * density).toInt().coerceAtMost(760)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
    val canvas = Canvas(bitmap)
    canvas.drawColor(parseColor(BACKGROUND, Color.WHITE))

    val snapshot = try { snapshotJson?.let(::JSONObject) } catch (_: Exception) { null }
    val months = snapshot?.optJSONArray("months")
    val currentDate = LocalDate.now()
    val currentCell = findCell(months, currentDate.toString())
    if (months == null || (mode != WidgetMode.MONTH && currentCell == null)) {
      drawEmpty(canvas, width, height, density)
      return RenderedWidget("모두의 근무", bitmap, mode)
    }

    if (mode == WidgetMode.TODAY) {
      drawSmall(canvas, currentCell!!, currentDate, width, height, density)
      return RenderedWidget("오늘의 근무", bitmap, mode)
    }
    if (mode == WidgetMode.THREE_DAY) {
      drawThreeDay(canvas, months, currentDate, width, height, density)
      return RenderedWidget("오늘과 가까운 근무", bitmap, mode)
    }

    val targetMonth = currentDate.withDayOfMonth(1).plusMonths(offset.toLong())
    val month = findMonth(months, targetMonth, offset)
    if (month == null) {
      drawEmpty(canvas, width, height, density)
      return RenderedWidget("모두의 근무", bitmap, mode)
    }
    drawCalendar(canvas, month, currentDate.toString(), width, height, density)
    return RenderedWidget(month.optString("label", "모두의 근무"), bitmap, mode)
  }

  private fun findMonth(months: JSONArray?, targetMonth: LocalDate, fallbackOffset: Int): JSONObject? {
    if (months == null) return null
    for (index in 0 until months.length()) {
      val month = months.optJSONObject(index) ?: continue
      if (month.optInt("year") == targetMonth.year && month.optInt("month") == targetMonth.monthValue) return month
    }
    for (index in 0 until months.length()) {
      val month = months.optJSONObject(index) ?: continue
      if (month.optInt("offset", Int.MIN_VALUE) == fallbackOffset) return month
    }
    return null
  }

  private fun findCell(months: JSONArray?, date: String): JSONObject? {
    if (months == null) return null
    for (monthIndex in 0 until months.length()) {
      val cells = months.optJSONObject(monthIndex)?.optJSONArray("cells") ?: continue
      for (cellIndex in 0 until cells.length()) {
        val cell = cells.optJSONObject(cellIndex) ?: continue
        if (cell.optString("date") == date && cell.optBoolean("inMonth", false)) return cell
      }
    }
    return null
  }

  private fun drawSmall(canvas: Canvas, cell: JSONObject, date: LocalDate, width: Int, height: Int, density: Float) {
    val centerX = width / 2f
    val datePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#5F6873", Color.GRAY)
      textAlign = Paint.Align.CENTER
      textSize = minOf(13f * density, height * 0.12f)
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }
    canvas.drawText("${date.monthValue}월 ${date.dayOfMonth}일 ${weekdayLabel(date)}요일", centerX, height * 0.18f, datePaint)

    val shift = cell.optJSONObject("shift")
    if (shift == null) {
      drawEmpty(canvas, width, height, density)
      return
    }
    val shiftPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor(shift.optString("textColor"), Color.DKGRAY)
      textAlign = Paint.Align.CENTER
      textSize = minOf(25f * density, height * 0.25f)
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }
    val badgeLeft = width * 0.12f
    val badgeRight = width * 0.88f
    val badgeTop = height * 0.27f
    val badgeBottom = height * 0.61f
    val badgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor(shift.optString("backgroundColor"), parseColor("#FFF640", Color.YELLOW))
    }
    canvas.drawRoundRect(RectF(badgeLeft, badgeTop, badgeRight, badgeBottom), height * 0.07f, height * 0.07f, badgePaint)
    val fm = shiftPaint.fontMetrics
    canvas.drawText(shiftLabel(shift), centerX, (badgeTop + badgeBottom) / 2f - (fm.ascent + fm.descent) / 2f, shiftPaint)

    val time = shiftTime(shift)
    if (time.isNotBlank()) {
      val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = parseColor("#343A40", Color.DKGRAY)
        textAlign = Paint.Align.CENTER
        textSize = minOf(12f * density, height * 0.105f)
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
      }
      canvas.drawText(time, centerX, height * 0.73f, timePaint)
    }
    drawCompactInfo(canvas, cell.optJSONArray("infoRows")?.optJSONObject(0), width * 0.08f, width * 0.92f, height * 0.79f, height * 0.93f, density)
  }

  private fun drawThreeDay(canvas: Canvas, months: JSONArray, date: LocalDate, width: Int, height: Int, density: Float) {
    val outerPadding = width * 0.035f
    val gap = width * 0.018f
    val columnWidth = (width - outerPadding * 2f - gap * 2f) / 3f
    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#6B7280", Color.GRAY)
      textAlign = Paint.Align.CENTER
      textSize = minOf(10.5f * density, height * 0.095f)
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }
    val todayBackground = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#FFFBEA", Color.WHITE)
    }
    val labels = listOf("오늘", "내일", "모레")

    labels.forEachIndexed { index, label ->
      val targetDate = date.plusDays(index.toLong())
      val left = outerPadding + index * (columnWidth + gap)
      val right = left + columnWidth
      if (index == 0) {
        canvas.drawRoundRect(
          RectF(left, height * 0.06f, right, height * 0.94f),
          8f * density,
          8f * density,
          todayBackground,
        )
      }
      canvas.drawText("$label · ${targetDate.dayOfMonth}일", (left + right) / 2f, height * 0.20f, labelPaint)
      val shift = findCell(months, targetDate.toString())?.optJSONObject("shift")
      if (shift != null) {
        drawShiftPanel(canvas, shift, left, height * 0.30f, right, height * 0.78f, density, false)
      }
    }
  }

  private fun drawShiftPanel(canvas: Canvas, shift: JSONObject, left: Float, top: Float, right: Float, bottom: Float, density: Float, prominent: Boolean) {
    val panelHeight = bottom - top
    val time = shiftTime(shift)
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor(shift.optString("backgroundColor"), parseColor("#FFF640", Color.YELLOW)) }
    val cornerRadius = minOf(8f * density, panelHeight * 0.25f)
    canvas.drawRoundRect(RectF(left, top, right, bottom), cornerRadius, cornerRadius, background)
    val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor(shift.optString("textColor"), Color.DKGRAY)
      textAlign = Paint.Align.CENTER
      textSize = minOf((if (prominent) 19f else 12f) * density, panelHeight * if (time.isBlank()) 0.5f else 0.36f)
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }
    val centerX = (left + right) / 2f
    val nameBaseline = if (time.isBlank()) (top + bottom) / 2f - (namePaint.fontMetrics.ascent + namePaint.fontMetrics.descent) / 2f else top + (bottom - top) * 0.47f
    canvas.drawText(ellipsize(shiftLabel(shift), namePaint, right - left - 8f * density), centerX, nameBaseline, namePaint)
    if (time.isNotBlank()) {
      val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = parseColor(shift.optString("textColor"), Color.DKGRAY)
        alpha = 210
        textAlign = Paint.Align.CENTER
        textSize = minOf((if (prominent) 10.5f else 8.5f) * density, panelHeight * 0.23f)
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
      }
      canvas.drawText(time, centerX, top + (bottom - top) * 0.78f, timePaint)
    }
  }

  private fun drawCompactInfo(canvas: Canvas, row: JSONObject?, left: Float, right: Float, top: Float, bottom: Float, density: Float) {
    if (row == null || bottom <= top) return
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor(row.optString("backgroundColor"), parseColor("#DFE3E5", Color.LTGRAY)) }
    canvas.drawRoundRect(RectF(left, top, right, bottom), 5f * density, 5f * density, background)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor(row.optString("textColor"), Color.DKGRAY)
      textAlign = Paint.Align.CENTER
      textSize = 9f * density
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }
    val baseline = (top + bottom) / 2f - (paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2f
    canvas.drawText(ellipsize(row.optString("text"), paint, right - left - 8f * density), (left + right) / 2f, baseline, paint)
  }

  private fun shiftLabel(shift: JSONObject): String =
    shift.optString("name").ifBlank { shift.optString("abbreviation", "근무") }

  private fun shiftTime(shift: JSONObject): String {
    if (shift.optString("kind") == "rest") return ""
    val start = shift.optString("startTime")
    val end = shift.optString("endTime")
    return if (start.isNotBlank() && end.isNotBlank()) "$start–$end" else ""
  }

  private fun weekdayLabel(date: LocalDate): String =
    arrayOf("일", "월", "화", "수", "목", "금", "토")[date.dayOfWeek.value % 7]

  private fun drawEmpty(canvas: Canvas, width: Int, height: Int, density: Float) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#6B7280", Color.DKGRAY)
      textAlign = Paint.Align.CENTER
      textSize = 14f * density
    }
    canvas.drawText("앱을 열어 위젯 데이터를 동기화해주세요.", width / 2f, height / 2f, paint)
  }

  private fun drawCalendar(canvas: Canvas, month: JSONObject, todayDate: String, width: Int, height: Int, density: Float) {
    val weekdays = arrayOf("일", "월", "화", "수", "목", "금", "토")
    val cells = month.optJSONArray("cells") ?: JSONArray()

    val widthScale = width / 560f
    val heightScale = height / 760f
    val scale = minOf(widthScale, heightScale).coerceAtLeast(0.72f)
    // Geometry must continue to fit all six rows. Visual elements use the
    // historical widget scale independently so text stays readable.
    val visualScale = minOf(width / 350f, height / 500f).coerceIn(1f, 1.6f)

    val horizontalPadding = 9f * scale
    val weekdayHeight = 34f * scale
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
        22f * scale,
        weekdayPaint
      )
    }

    val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#EEF1F4", Color.LTGRAY)
      strokeWidth = maxOf(1f, 1f * scale)
    }
    val infoBackgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    val infoTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textAlign = Paint.Align.LEFT
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
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
      drawCell(
        canvas,
        cell,
        todayDate,
        left,
        top,
        cellWidth,
        cellHeight,
        scale,
        visualScale,
        infoBackgroundPaint,
        infoTextPaint
      )
    }
  }

  private fun drawCell(
    canvas: Canvas,
    cell: JSONObject,
    todayDate: String,
    left: Float,
    top: Float,
    width: Float,
    height: Float,
    scale: Float,
    visualScale: Float,
    infoBackgroundPaint: Paint,
    infoTextPaint: Paint
  ) {
    val inMonth = cell.optBoolean("inMonth", false)
    val alpha = if (inMonth) 255 else 92
    val centerX = left + width / 2f

    val dateBaseline = top + height * 0.19f
    val badgeTop = top + height * 0.25f
    val badgeHeight = minOf(height * 0.20f, (17f * visualScale).coerceIn(20f, 27f))

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

    if (cell.optString("date") == todayDate) {
      val todayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = parseColor("#5A8DEE", Color.BLUE)
        style = Paint.Style.STROKE
        strokeWidth = maxOf(1.5f, 1.5f * scale)
        this.alpha = if (inMonth) 220 else 110
      }
      canvas.drawRoundRect(RectF(left + 2.5f * scale, top + 2.5f * scale, left + width - 2.5f * scale, top + height - 2.5f * scale), 7f * scale, 7f * scale, todayPaint)
    }

    canvas.drawText(cell.optInt("day").toString(), centerX, dateBaseline, datePaint)

    val shift = cell.optJSONObject("shift")
    if (shift != null) {
      val abbreviation = shift.optString("abbreviation").take(4)
      val badgeWidth = minOf(
        width - 7f * scale,
        maxOf(
          (28f * visualScale).coerceIn(42f, 46f),
          (abbreviation.length * 9f + 15f) * visualScale
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
    if (!inMonth) return
    val infoRows = cell.optJSONArray("infoRows") ?: JSONArray()
    val infoTop = top + height * 0.53f
    val rowGap = 2.5f * scale
    val rowHeight = minOf(height * 0.19f, (14f * visualScale).coerceIn(17f, 23f))
    for (index in 0 until minOf(2, infoRows.length())) {
      val row = infoRows.optJSONObject(index) ?: continue
      val rowTop = infoTop + index * (rowHeight + rowGap)
      val rowLeft = left + 2.5f * scale
      val rowRight = left + width - 2.5f * scale
      infoBackgroundPaint.color = parseColor(row.optString("backgroundColor"), parseColor("#DFE3E5", Color.LTGRAY))
      canvas.drawRoundRect(RectF(rowLeft, rowTop, rowRight, rowTop + rowHeight), 4f * scale, 4f * scale, infoBackgroundPaint)
      infoTextPaint.color = parseColor(row.optString("textColor"), Color.DKGRAY)
      infoTextPaint.textSize = (8.5f * visualScale).coerceIn(10f, 13.6f)
      val fm = infoTextPaint.fontMetrics
      val baseline = rowTop + rowHeight / 2f - (fm.ascent + fm.descent) / 2f
      canvas.drawText(ellipsizeInfoRow(row.optString("text"), infoTextPaint, rowRight - rowLeft - 5f * scale), rowLeft + 2.5f * scale, baseline, infoTextPaint)
    }
  }

  private fun ellipsizeInfoRow(value: String, paint: Paint, maxWidth: Float): String {
    if (paint.measureText(value) <= maxWidth) return value
    val overflowSuffix = INFO_OVERFLOW_SUFFIX.find(value)?.value.orEmpty()
    val withoutOverflow = if (overflowSuffix.isEmpty()) value else value.dropLast(overflowSuffix.length)
    val timePrefix = INFO_TIME_PREFIX.find(withoutOverflow)?.value.orEmpty()
    val title = withoutOverflow.drop(timePrefix.length)
    val ellipsisWidth = paint.measureText("…")

    val fixedWidth = paint.measureText(timePrefix + overflowSuffix)
    if (timePrefix.isNotEmpty() && overflowSuffix.isNotEmpty() && fixedWidth + ellipsisWidth <= maxWidth) {
      return timePrefix + ellipsize(title, paint, maxWidth - fixedWidth) + overflowSuffix
    }
    if (overflowSuffix.isNotEmpty() && paint.measureText(overflowSuffix) + ellipsisWidth <= maxWidth) {
      return ellipsize(withoutOverflow, paint, maxWidth - paint.measureText(overflowSuffix)) + overflowSuffix
    }
    if (timePrefix.isNotEmpty() && paint.measureText(timePrefix) + ellipsisWidth <= maxWidth) {
      return timePrefix + ellipsize(title, paint, maxWidth - paint.measureText(timePrefix))
    }
    return ellipsize(value, paint, maxWidth)
  }

  private fun ellipsize(value: String, paint: Paint, maxWidth: Float): String {
    if (paint.measureText(value) <= maxWidth) return value
    val suffix = "…"
    val suffixWidth = paint.measureText(suffix)
    if (maxWidth < suffixWidth) return ""
    val count = paint.breakText(
      value,
      true,
      maxWidth - suffixWidth,
      null
    )
    var safeCount = count.coerceAtLeast(0)
    if (safeCount > 0 && Character.isHighSurrogate(value[safeCount - 1])) safeCount -= 1
    return value.take(safeCount) + suffix
  }

  private fun parseColor(value: String?, fallback: Int): Int = try {
    if (value.isNullOrBlank()) fallback else Color.parseColor(value)
  } catch (_: IllegalArgumentException) {
    fallback
  }
}
