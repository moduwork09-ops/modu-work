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
    val outerPadding = width * 0.025f
    val gap = width * 0.012f
    val columnWidth = (width - outerPadding * 2f - gap * 2f) / 3f
    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#6B7280", Color.GRAY)
      textAlign = Paint.Align.CENTER
      textSize = minOf(9.5f * density, height * 0.085f)
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }
    val todayBackground = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#F5F9FF", Color.WHITE)
    }
    val labels = listOf("오늘", "내일", "모레")

    labels.forEachIndexed { index, label ->
      val targetDate = date.plusDays(index.toLong())
      val left = outerPadding + index * (columnWidth + gap)
      val right = left + columnWidth
      if (index == 0) {
        canvas.drawRoundRect(
          RectF(left, height * 0.07f, right, height * 0.93f),
          8f * density,
          8f * density,
          todayBackground,
        )
      }
      val centerX = (left + right) / 2f
      canvas.drawText(label, centerX, height * 0.13f, labelPaint)
      val datePaint = Paint(labelPaint).apply { textSize = minOf(8.5f * density, height * 0.072f); typeface = Typeface.create("sans-serif", Typeface.NORMAL) }
      canvas.drawText("${targetDate.monthValue}월 ${targetDate.dayOfMonth}일 (${weekdayLabel(targetDate)})", centerX, height * 0.26f, datePaint)
      val cell = findCell(months, targetDate.toString())
      val shift = cell?.optJSONObject("shift")
      if (shift != null) {
        drawThreeDayShift(canvas, shift, left + 2f * density, height * 0.34f, right - 2f * density, height, density)
      }
      drawThreeDayInfo(canvas, cell?.optJSONArray("infoRows")?.optJSONObject(0), left + 2f * density, right - 2f * density, height * 0.79f, height * 0.91f, density)
    }
  }

  private fun drawThreeDayShift(canvas: Canvas, shift: JSONObject, left: Float, top: Float, right: Float, height: Int, density: Float) {
    val centerX = (left + right) / 2f
    val pillBottom = top + height * 0.18f
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor(shift.optString("backgroundColor"), Color.YELLOW) }
    canvas.drawRoundRect(RectF(left, top, right, pillBottom), 7f * density, 7f * density, background)
    val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor(shift.optString("textColor"), Color.DKGRAY)
      textAlign = Paint.Align.CENTER
      textSize = minOf(8.2f * density, height * 0.072f)
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }
    val nameBaseline = (top + pillBottom) / 2f - (namePaint.fontMetrics.ascent + namePaint.fontMetrics.descent) / 2f
    canvas.drawText(ellipsize(shiftLabel(shift), namePaint, right - left - 2f * density), centerX, nameBaseline, namePaint)
    val time = shiftTime(shift)
    if (time.isBlank()) return
    val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#5F6873", Color.GRAY)
      textAlign = Paint.Align.CENTER
      textSize = minOf(7.2f * density, height * 0.061f)
      typeface = Typeface.create("sans-serif", Typeface.NORMAL)
    }
    canvas.drawText(ellipsize(time, timePaint, right - left), centerX, pillBottom + height * 0.13f, timePaint)
  }

  private fun drawThreeDayInfo(canvas: Canvas, row: JSONObject?, left: Float, right: Float, top: Float, bottom: Float, density: Float) {
    if (row == null || bottom <= top) return
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#5F6873", Color.DKGRAY)
      textAlign = Paint.Align.CENTER
      textSize = 6.8f * density
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }
    val text = ellipsizeInfoRow(row.optString("text"), paint, right - left - 5f * density)
    val centerX = (left + right) / 2f
    val baseline = (top + bottom) / 2f - (paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2f
    val textWidth = paint.measureText(text)
    val horizontalPadding = 3f * density
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor(row.optString("highlightColor"), parseColor("#EEF3F8", Color.LTGRAY)) }
    canvas.drawRoundRect(RectF(centerX - textWidth / 2f - horizontalPadding, top, centerX + textWidth / 2f + horizontalPadding, bottom), 4f * density, 4f * density, background)
    canvas.drawText(text, centerX, baseline, paint)
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
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor(row.optString("highlightColor"), parseColor("#EEF3F8", Color.LTGRAY)) }
    canvas.drawRoundRect(RectF(left, top, right, bottom), 5f * density, 5f * density, background)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor("#5F6873", Color.DKGRAY)
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
    return if (start.isNotBlank() && end.isNotBlank()) "$start~$end" else ""
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
      textSize = (13.7f * visualScale).coerceIn(16.5f, 21.5f)
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
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
    infoTextPaint: Paint
  ) {
    val inMonth = cell.optBoolean("inMonth", false)
    val alpha = if (inMonth) 255 else 92
    val centerX = left + width / 2f

    val dateBaseline = top + height * 0.19f
    val holidayName = if (cell.isNull("holidayName")) "" else cell.optString("holidayName")
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
      textSize = (13.7f * visualScale).coerceIn(16.5f, 21.5f)
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }

    if (cell.optString("date") == todayDate) {
      val todayBackground = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor("#F5F9FF", Color.WHITE) }
      canvas.drawRoundRect(RectF(left + 2f * scale, top + 2f * scale, left + width - 2f * scale, top + height - 2f * scale), 7f * scale, 7f * scale, todayBackground)
      val todayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = parseColor("#243447", Color.DKGRAY)
        style = Paint.Style.STROKE
        strokeWidth = maxOf(1.5f, 1.5f * scale)
        this.alpha = if (inMonth) 220 else 110
      }
      canvas.drawRoundRect(RectF(left + 2.5f * scale, top + 2.5f * scale, left + width - 2.5f * scale, top + height - 2.5f * scale), 7f * scale, 7f * scale, todayPaint)
    }

    val dayText = cell.optInt("day").toString()
    if (holidayName.isBlank()) {
      canvas.drawText(dayText, centerX, dateBaseline, datePaint)
    } else {
      val holidayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = parseColor("#E06F62", Color.RED)
        textAlign = Paint.Align.LEFT
        textSize = (6.2f * visualScale).coerceIn(7.2f, 9.8f)
        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
      }
      val inlineDatePaint = Paint(datePaint).apply {
        textAlign = Paint.Align.LEFT
      }
      val dayWidth = inlineDatePaint.measureText(dayText)
      val gap = 2.5f * scale
      val holidayMaxWidth = (width - dayWidth - gap - 8f * scale).coerceAtLeast(1f)
      val visibleHoliday = ellipsize(holidayName, holidayPaint, holidayMaxWidth)
      val holidayWidth = holidayPaint.measureText(visibleHoliday)
      val groupWidth = dayWidth + gap + holidayWidth
      val groupLeft = centerX - groupWidth / 2f

      canvas.drawText(dayText, groupLeft, dateBaseline, inlineDatePaint)
      canvas.drawText(
        visibleHoliday,
        groupLeft + dayWidth + gap,
        dateBaseline,
        holidayPaint
      )
    }

    val shift = cell.optJSONObject("shift")
    if (shift != null) {
      val abbreviation = shift.optString("abbreviation").take(4)
      val badgeWidth = width - 8f * scale

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
        textSize = (12f * visualScale).coerceIn(14.5f, 19.2f)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      }

      val fm = badgeText.fontMetrics
      val badgeTextBaseline =
        badgeTop + badgeHeight / 2f - (fm.ascent + fm.descent) / 2f
      canvas.drawText(abbreviation, centerX, badgeTextBaseline, badgeText)
    }
    if (!inMonth) return
    val infoRows = cell.optJSONArray("infoRows") ?: JSONArray()
    val infoCount = maxOf(infoRows.length(), cell.optInt("infoCount", infoRows.length()))
    val infoTop = top + height * 0.49f
    val maxRows = if (height >= 24f * scale) 4 else 3
    val visibleCount = minOf(maxRows, infoRows.length())
    if (visibleCount == 0) return
    val infoBottom = top + height - 2f * scale
    val rowHeight = ((infoBottom - infoTop) / maxRows).coerceAtLeast(1f)
    for (index in 0 until visibleCount) {
      val row = infoRows.optJSONObject(index) ?: continue
      val rowTop = infoTop + index * rowHeight
      val rowLeft = left + 3f * scale
      val rowRight = left + width - 2f * scale
      infoTextPaint.color = parseColor("#5F6873", Color.DKGRAY)
      infoTextPaint.textSize = minOf(rowHeight * 0.72f, (7.6f * visualScale).coerceIn(8.8f, 12.2f))
      infoTextPaint.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      val fm = infoTextPaint.fontMetrics
      val baseline = rowTop + rowHeight / 2f - (fm.ascent + fm.descent) / 2f
      val dotRadius = maxOf(1.25f, 1.45f * scale)
      val dotCenterX = rowLeft + dotRadius
      val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor(row.optString("dotColor"), parseColor("#8F98A3", Color.GRAY)) }
      canvas.drawCircle(dotCenterX, rowTop + rowHeight / 2f, dotRadius, dotPaint)
      val textLeft = dotCenterX + dotRadius + 2f * scale
      val availableWidth = rowRight - textLeft
      val hiddenCount = if (index == visibleCount - 1) maxOf(0, infoCount - visibleCount) else 0
      val rawText = row.optString("text") + if (hiddenCount > 0) " +$hiddenCount" else ""
      val visibleText = ellipsizeInfoRow(rawText, infoTextPaint, availableWidth)
      canvas.drawText(visibleText, textLeft, baseline, infoTextPaint)
    }
  }

  private fun drawInfoHighlight(canvas: Canvas, row: JSONObject, text: String, left: Float, baseline: Float, paint: Paint, maxWidth: Float, scale: Float) {
    val horizontalPadding = 2.5f * scale
    val width = minOf(maxWidth, paint.measureText(text) + horizontalPadding * 2f)
    val fm = paint.fontMetrics
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = parseColor(row.optString("highlightColor"), parseColor("#EEF3F8", Color.LTGRAY)) }
    canvas.drawRoundRect(RectF(left - horizontalPadding, baseline + fm.ascent - 1f * scale, left - horizontalPadding + width, baseline + fm.descent + 1f * scale), 2.8f * scale, 2.8f * scale, background)
    canvas.drawText(text, left, baseline, paint)
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

  private fun wrapTwoLines(value: String, paint: Paint, maxWidth: Float): List<String> {
    if (paint.measureText(value) <= maxWidth) return listOf(value)
    var split = paint.breakText(value, true, maxWidth, null).coerceAtLeast(1)
    if (split < value.length && Character.isHighSurrogate(value[split - 1])) split -= 1
    val first = value.take(split).trimEnd()
    val rest = value.drop(split).trimStart()
    return listOf(first, ellipsizeInfoRow(rest, paint, maxWidth))
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
