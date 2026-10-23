# Navigation Glasses ? Google Navigation SDK + BLE + ESP32-C3

The Android phone calculates routes using Google's Navigation SDK. It sends one-byte maneuver commands over BLE to an ESP32-C3, which drives two LEDs.

| Byte | Command | LEDs |
| --- | --- | --- |
| `0x00` | OFF | Both off |
| `0x01` | LEFT | Left blinks |
| `0x02` | RIGHT | Right blinks |
| `0x03` | STRAIGHT | Both blink together |
| `0x04` | U-TURN | LEDs alternate |

## ESP32 setup

Open `esp32/NavigationGlasses/NavigationGlasses.ino` in Arduino IDE. Select **ESP32C3 Dev Module**. The firmware is built against Espressif's Arduino ESP32 core **3.3.10**.

- GPIO1: left LED.
- GPIO20: right LED. This pin is also UART0 RX; avoid a UART connection driving it while it is used as an LED output.
- Each LED: GPIO ? 680 ohm resistor ? LED ? GND.

Flash the sketch and check for `NavigationGlasses BLE ready` at 115200 baud. The glasses advertise the Nordic UART service UUID `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`; commands are written to characteristic `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`.

LEDs turn off when BLE disconnects or no valid update arrives for five seconds. The Android navigation feed refreshes commands once per second, including unchanged maneuvers. This also restores the display after reconnection.

To compile with Arduino CLI and an installed ESP32 core:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32c3 esp32/NavigationGlasses
```

## Google Cloud and Android setup

Use a Google Cloud project with billing and **Navigation SDK for Android** enabled. Create an Android API key restricted to this application's package name and signing certificate. See Google's [project setup guide](https://developers.google.com/maps/documentation/navigation/android-sdk/set-up-project).

Create `local.properties` in the project root:

```properties
sdk.dir=C\:/Users/YOUR_NAME/AppData/Local/Android/Sdk
MAPS_API_KEY=YOUR_GOOGLE_MAPS_PLATFORM_API_KEY
```

`local.properties` is ignored by Git. Never commit a real API key or signing keystore. The placeholder in `local.defaults.properties` allows builds and unit tests without a key; navigation requires a valid key at runtime.

Open this folder in Android Studio and allow Gradle sync to install missing components. Use a physical Android phone with Google Play services and BLE. On Android 6?11, turn on system location services for BLE scanning.

Build requirements:

- JDK 17.
- Gradle 8.13, provided by the checked-in wrapper.
- Android Gradle Plugin 8.13.2 and Kotlin 2.3.0.
- Android SDK platform 36 and build tools 35.0.0.
- Navigation SDK for Android 7.9.0.
- Android 7.0 / API 24 or newer on the phone.

Run checks from the project root:

```sh
./gradlew assembleDebug testDebugUnitTest lintDebug
```

On Windows, use `gradlew.bat assembleDebug testDebugUnitTest lintDebug`. The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Unit tests cover the alert-distance boundary, invalid/missing navigation data, and maneuver-to-BLE mapping.

## Run

1. Turn on Bluetooth and the ESP32-C3 glasses.
2. Start the Android app and grant precise location, nearby devices/Bluetooth, and notification permissions.
3. Accept Google's Navigation Terms when prompted.
4. Tap **Connect Glasses** and wait for `BLE: BLE READY`. Scanning and connection attempts time out after 15 seconds; tap again to retry.
5. Long-press the map to choose a destination, then tap **Start**.
6. The app requests a **TWO_WHEELER** route. This travel mode depends on regional availability.
7. Within 180 m of the next maneuver, the corresponding LEDs blink. Missing or invalid instructions clear the LEDs.
8. Tap **Simulate** to test an active route at 5? speed.
9. Tap **Stop** to cancel pending route calculation, stop guidance and simulation, and clear the LEDs. Arrival and closing the activity also stop the session.

The alert distance is configured in `TurnAlertPolicy.TURN_ALERT_DISTANCE_METERS` in `app/src/main/java/com/example/navigationglasses/TurnAlertPolicy.kt`.

## Device verification

A successful build does not verify Google Cloud authorization, route availability, or physical BLE/LED behavior. Before field use, test on the phone and glasses:

- First-run permissions on Android 12 or newer; deny and retry permissions as well.
- Left/right/straight/U-turn commands using route simulation.
- Stop while a route is calculating and while simulation is running.
- Disconnect/reconnect the glasses while the same maneuver remains active.
- Turn Bluetooth off while scanning or connected, then reconnect.
- Stop navigation updates while leaving BLE connected; LEDs should clear within five seconds.

This prototype embeds Google's Navigation SDK. It does not read the installed Google Maps application's notifications or scrape its UI.
