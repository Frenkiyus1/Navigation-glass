# Navi Glass — Web GPS + Bluetooth, miễn phí

Bản web có bản đồ OpenStreetMap, tìm kiếm địa điểm, GPS thực, chỉ dẫn rẽ bằng tiếng Việt, đọc chỉ dẫn, mô phỏng hành trình và gửi lệnh BLE tới kính ESP32-C3. **Phần web không cần Google API key, billing hoặc thẻ thanh toán.**

## Deploy trên Cloudflare đang liên kết GitHub

Repo có sẵn `wrangler.jsonc`; Wrangler triển khai thư mục **`web/`**. Lệnh deploy cũ `npx wrangler deploy` dùng được, khắc phục lỗi không tìm thấy static files.

Trong Cloudflare Workers & Pages → dự án → Settings → Builds:

| Mục | Giá trị |
| --- | --- |
| Repository / branch | `Frenkiyus1/Navigation-glass` / `main` |
| Root directory | Để trống, dùng thư mục gốc repo |
| Build command | Để trống; web không cần build |
| Deploy command | `npx wrangler deploy` |
| Worker name | `navigation-glass`, khớp `name` trong `wrangler.jsonc` |

Nếu Worker hiện có tên khác, sửa `name` trong `wrangler.jsonc` cho khớp tên Worker trước khi deploy. Chọn **Retry deployment** sau khi GitHub đã nhận bản cập nhật. Không chọn `app/` hoặc `esp32/` làm root directory.

Không cần thêm secret hoặc API key cho bản web. Dùng địa chỉ **HTTPS** của Cloudflare trên điện thoại để GPS/Bluetooth được cấp quyền. Hạn mức hosting phụ thuộc gói Cloudflare của tài khoản.

## Chạy và kiểm tra tại máy

Cần Node.js 22 trở lên:

```sh
npm ci
npm run dev
```

Mở `http://localhost:8787`. Localhost được trình duyệt xem là môi trường bảo mật; địa chỉ HTTP qua mạng LAN trên điện thoại không được cấp GPS/Bluetooth như HTTPS.

```sh
npm run check
npx wrangler deploy --dry-run
npm run test:browser
```

Kiểm thử trình duyệt dùng Chrome đã cài trên Windows. Trên hệ điều hành khác, chạy `npx playwright install chromium` hoặc đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` tới executable Chromium/Chrome hiện có. Kiểm thử GPS/BLE dùng thiết bị giả lập; cần thử lại với điện thoại và kính thật.

## Dùng web với kính

1. Nạp firmware `esp32/NavigationGlasses/NavigationGlasses.ino` vào ESP32-C3.
2. Mở web HTTPS bằng **Chrome trên Android**, bật Bluetooth và GPS.
3. Chọn **Kết nối kính**, chọn thiết bị `NavigationGlasses` và cho phép truy cập.
4. Bấm **Vị trí của tôi** rồi tìm điểm đến. Có thể chạm bản đồ để chọn hai điểm hoặc nhập tọa độ `10.77, 106.70`.
5. Chọn xe đạp, đi bộ hoặc ô tô, bấm **Tìm đường** rồi **Bắt đầu GPS**.
6. Kính nhận hướng khi còn 180 m tới điểm rẽ; có thể đổi ngưỡng sang 100/250 m.
7. Dùng **Mô phỏng** hoặc **Đi thử một vòng Sài Gòn** để thử mà không cần di chuyển. Thanh tiến độ giúp thử từng điểm rẽ.
8. **Dừng hành trình** sẽ hủy GPS và mô phỏng, đồng thời gửi OFF. Thử đèn thủ công tự tắt sau bốn giây.

Giữ tab và màn hình mở khi dẫn đường. Web yêu cầu giữ màn hình sáng nếu trình duyệt hỗ trợ. Khi đổi tab, GPS quá cũ (>15 giây), sai số >50 m hoặc cách tuyến >60 m, tín hiệu kính chuyển OFF. Khi ngoài tuyến, chọn tính lại từ vị trí hiện tại. Firmware tự tắt LED nếu không nhận lệnh trong năm giây.

Safari/iPhone và Firefox chưa hỗ trợ kết nối kính bằng Web Bluetooth. Bản đồ và mô phỏng vẫn dùng được. Web Bluetooth cần thiết bị BLE có cùng service/characteristic UUID với firmware hiện có.

### Bấm kết nối nhưng không thấy kính

- Mở trực tiếp bằng Chrome trên Android; cấp quyền Thiết bị ở gần/Bluetooth cho Chrome nếu hệ điều hành yêu cầu.
- Ngắt kính khỏi app Android, ứng dụng kiểm tra BLE hoặc điện thoại khác, rồi nhấn RESET trên ESP32 và thử lại khi để kính gần điện thoại.
- Với firmware tự sửa, giữ `addServiceUUID(SERVICE_UUID)` và `setScanResponse(true)`. Tên đầy đủ `NavigationGlasses` và UUID 128 bit cần hai gói quảng bá/phản hồi quét; tắt scan response có thể khiến tên bị rút ngắn. Web tìm theo UUID hoặc tên bắt đầu bằng `NavigationGlasses`.
- Với ESP32-C3 SuperMini nối USB trực tiếp, bật **Tools → USB CDC On Boot → Enabled** trước khi nạp để xem Serial qua USB; chọn đúng cổng USB của kính.
- Nạp lại firmware trong repo. Mở Serial Monitor ở **115200 baud** rồi nhấn RESET: cần thấy `BLE advertising requested: NavigationGlasses` và dòng service UUID. Nếu báo `ERROR`, gửi lại dòng lỗi; thông báo requested chỉ xác nhận yêu cầu khởi động quảng bá được thư viện chấp nhận, chưa xác nhận điện thoại đã nhận sóng.
- Khi kết nối thành công, Serial Monitor hiện `BLE connected`; thử nút trái/phải sẽ có dòng `Command: 0x01` / `Command: 0x02`.

## Dịch vụ miễn phí và giới hạn

- Bản đồ: [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Có attribution, giữ cache HTTP; không tải sẵn/bulk-download tile.
- Tìm kiếm: [Photon public demo server](https://github.com/komoot/photon#demo-server). Chỉ gửi khi người dùng bấm tìm, có cache và giới hạn tần suất. Dịch vụ công cộng có thể giới hạn hoặc ngừng phản hồi.
- Tuyến: [FOSSGIS/OSRM](https://routing.openstreetmap.de/about.html). Tối đa một request/giây theo chính sách; ứng dụng giới hạn các lần tính tuyến, cache kết quả và không tự động gọi theo mỗi bản tin GPS. Không dành cho lưu lượng lớn.
- Các dịch vụ có thể thay đổi trong `web/config.json`. Khi nhiều người cùng sử dụng, cần chuyển sang nhà cung cấp phù hợp hoặc tự host; “không cần thẻ” không có nghĩa là dịch vụ công cộng không có hạn mức.
- Hiện hỗ trợ tuyến **xe đạp, đi bộ, ô tô**. Chưa có dữ liệu giao thông trực tiếp, chỉ dẫn làn đường hoặc profile riêng cho xe máy. Không thay tên tuyến ô tô/xe đạp thành tuyến xe máy.
- Bản web không đọc hướng dẫn từ ứng dụng Google Maps. Nó tính tuyến bằng OSRM và theo dõi GPS trong trình duyệt.
- Tọa độ điểm đầu/cuối được gửi tới dịch vụ tính tuyến; truy vấn địa điểm gửi tới Photon. Ứng dụng không ghi lịch sử GPS lên server. Ba điểm đến gần nhất chỉ lưu trong trình duyệt.
- Service worker chỉ lưu giao diện/tuyến mẫu. Không tải bản đồ ngoại tuyến; tìm kiếm, tính tuyến mới và tile chưa có trong cache cần Internet.

Thư viện Leaflet 1.9.4 được lưu trong `web/vendor/`, kèm license. Tuyến mẫu trong `web/data/demo-route.json` tính bằng FOSSGIS/OSRM từ dữ liệu OpenStreetMap, từ Chợ Bến Thành tới Nhà thờ Đức Bà.

---

# Android + ESP32: Google Navigation SDK

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
- Each LED: GPIO -> 680 ohm resistor -> LED -> GND.

Flash the sketch, open Serial Monitor at 115200 baud, and reset the board. Check for `BLE advertising requested: NavigationGlasses` (request accepted, not a radio verification); a failed initialization or advertising request prints `ERROR`. The glasses advertise the Nordic UART service UUID `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`; commands are written to characteristic `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`.

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

Open this folder in Android Studio and allow Gradle sync to install missing components. Use a physical Android phone with Google Play services and BLE. On Android 6-11, turn on system location services for BLE scanning.

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
8. Tap **Simulate** to test an active route at 5x speed.
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
