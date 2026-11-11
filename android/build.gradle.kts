// Mellifera TV — single Gradle module (root project IS the app module).
// Stack pins proven by the T0 probe (tasks/1.2): Gradle 8.10.2 / AGP 8.7.3 /
// Kotlin 2.0.21 / compileSdk+targetSdk 35 / buildTools 37.0.0 / JDK 17.
import com.android.build.gradle.internal.api.BaseVariantOutputImpl
import java.util.Properties

plugins {
    id("com.android.application") version "8.7.3"
    id("org.jetbrains.kotlin.android") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
}

// D4: versionName/versionCode ride -P props; the APK FILENAME is the version
// wire contract (mellifera-tv-<version>.apk). Dev defaults keep plain
// `assembleDebug` runnable without props.
val versionNameProp: String = (project.findProperty("versionName") as String?) ?: "0.1.0-dev"
val versionCodeProp: Int = (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 1

// D6 signing law: release is signed ONLY from android/keystore.properties
// (gitignored). assembleRelease without it FAILS LOUDLY below — a
// debug-signed release shipped once blocks updates on that TV forever.
// The debug fallback is confined to assembleDebug (AGP's debug keystore).
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        keystorePropsFile.inputStream().use { load(it) }
    }
}

if (keystorePropsFile.exists()) {
    val required = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
    val missing = required.filter { keystoreProps.getProperty(it).isNullOrBlank() }
    check(missing.isEmpty()) {
        "android/keystore.properties exists but is missing: ${missing.joinToString()}"
    }
}

android {
    namespace = "tv.mellifera"
    compileSdk = 35
    buildToolsVersion = "37.0.0"

    defaultConfig {
        applicationId = "tv.mellifera"
        minSdk = 23
        targetSdk = 35
        versionCode = versionCodeProp
        versionName = versionNameProp
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            // No debug-keystore fallback here on purpose: without
            // keystore.properties assembleRelease fails loudly (below).
        }
        debug {
            // AGP's debug keystore only — never keystore.properties.
        }
    }

    tasks.matching { it.name == "assembleRelease" || it.name == "bundleRelease" }
        .configureEach {
            doFirst {
                if (!keystorePropsFile.exists()) {
                    throw GradleException(
                        "assembleRelease requires android/keystore.properties " +
                            "(storeFile, storePassword, keyAlias, keyPassword) — D6 " +
                            "signing law. Generate the keystore once (keytool " +
                            "-genkeypair -validity 10000) and keep it backed up; " +
                            "assembleDebug does not need it."
                    )
                }
            }
        }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// D4: the filename is the version contract — mellifera-tv-<versionName>.apk.
// The Kotlin DSL `android {}` accessor exposes only the clean DSL interface
// (no applicationVariants), so the typed extension is fetched explicitly.
val androidAppExtension = extensions.getByType(com.android.build.gradle.AppExtension::class.java)
androidAppExtension.applicationVariants.configureEach {
    val variant = this
    variant.outputs.configureEach {
        (this as BaseVariantOutputImpl).outputFileName =
            "mellifera-tv-${variant.versionName}.apk"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.tv:tv-material:1.0.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    implementation("io.coil-kt:coil-compose:2.7.0")

    val media3 = "1.4.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-exoplayer-hls:$media3")
    implementation("androidx.media3:media3-session:$media3")

    // 5.3 transport pins: Retrofit + kotlinx.serialization over OkHttp,
    // bearer-token interceptor; MockWebServer drives the JVM contract tests.
    val okhttp = "4.12.0"
    implementation("com.squareup.okhttp3:okhttp:$okhttp")
    val retrofit = "2.11.0"
    implementation("com.squareup.retrofit2:retrofit:$retrofit")
    implementation("com.squareup.retrofit2:converter-kotlinx-serialization:$retrofit")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    testImplementation("com.squareup.okhttp3:mockwebserver:$okhttp")
    testImplementation("junit:junit:4.13.2")
}
