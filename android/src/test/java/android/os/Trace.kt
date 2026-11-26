package android.os

/**
 * Test-only shadow of android.os.Trace: compose-runtime (1.7.x) traces
 * composition unconditionally (ActualAndroid.android.kt calls
 * Trace.beginSection with no guard), and the unit-test classpath's mockable
 * android.jar makes every unmocked method throw — so any one-shot
 * composition in a JVM test dies before it renders. This shadow supplies
 * the two statics compose actually calls as no-ops; the classpath places
 * compiled test classes ahead of the mockable jar, so this wins the
 * dispatch. Session-side seam fix for task 16.1's LocalUiScale canaries —
 * scope stops at begin/endSection, the verified call path.
 */
object Trace {
    @JvmStatic
    fun beginSection(sectionName: String) {
    }

    @JvmStatic
    fun endSection() {
    }
}
