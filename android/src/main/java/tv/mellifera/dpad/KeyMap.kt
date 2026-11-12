package tv.mellifera.dpad

import android.view.KeyEvent

/**
 * The device-side translation — android.view.KeyEvent → the pure law's
 * [DpadKey]. Null for keys the app doesn't route (never consumed). The
 * caller reads the event's own repeatCount for the seek acceleration.
 */
fun KeyEvent.toDpadKey(): DpadKey? = when (keyCode) {
    KeyEvent.KEYCODE_DPAD_LEFT -> DpadKey.Left
    KeyEvent.KEYCODE_DPAD_RIGHT -> DpadKey.Right
    KeyEvent.KEYCODE_DPAD_UP -> DpadKey.Up
    KeyEvent.KEYCODE_DPAD_DOWN -> DpadKey.Down
    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> DpadKey.Ok
    KeyEvent.KEYCODE_BACK -> DpadKey.Back
    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> DpadKey.PlayPause
    else -> null
}
