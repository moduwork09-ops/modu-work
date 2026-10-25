package expo.modules.moduworkwidget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory

/** Basic pack is bundled; future packs only add their drawable map here. */
internal object StickerDrawableRegistry {
  private val basic = mapOf(
    "birthday" to R.drawable.sticker_basic_birthday,
    "anniversary" to R.drawable.sticker_basic_anniversary,
    "cafe" to R.drawable.sticker_basic_cafe,
    "meal" to R.drawable.sticker_basic_meal,
    "shopping" to R.drawable.sticker_basic_shopping,
    "gift" to R.drawable.sticker_basic_gift,
    "call" to R.drawable.sticker_basic_call,
    "important" to R.drawable.sticker_basic_important,
    "travel" to R.drawable.sticker_basic_travel,
    "car" to R.drawable.sticker_basic_car,
    "business_trip" to R.drawable.sticker_basic_business_trip,
    "exercise" to R.drawable.sticker_basic_exercise,
    "hospital" to R.drawable.sticker_basic_hospital,
    "dentist" to R.drawable.sticker_basic_dentist,
    "health" to R.drawable.sticker_basic_health,
    "home_family" to R.drawable.sticker_basic_home_family,
  )
  private val cache = mutableMapOf<Int, Bitmap>()

  fun get(context: Context, packId: String?, key: String?): Bitmap? {
    if (packId != "basic" || key == null) return null
    val drawableId = basic[key] ?: return null
    return synchronized(cache) {
      cache[drawableId] ?: BitmapFactory.decodeResource(context.resources, drawableId)?.also { cache[drawableId] = it }
    }
  }
}
