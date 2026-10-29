# BeeBot Connect — MVP v0.1

A responsive, local-first web dashboard prototype for the BeeBot ESP32 hive-monitoring system.

## Included now
- Phone/laptop responsive dashboard
- Demo readings so you can preview the UI before connecting hardware
- WebSocket connection form for an ESP32 at `ws://<ESP32-IP>/ws`
- Local browser history (up to 250 recent readings), charts, CSV export
- Configurable temperature/humidity/weight thresholds and local browser notifications
- Optional camera stream URL field for HTTP image/MJPEG streams

## Important limitations
- This is a front-end MVP. Real readings require the ESP32 firmware to send the JSON format below.
- Local history is stored separately in each browser/device. Shared phone/laptop history needs a local server/database.
- Browser notifications generally require a secure context or localhost, and permission from the user.
- Camera compatibility depends on the camera firmware and stream format. The ESP32-CAM is a separate device with its own IP unless you intentionally relay its stream.
- Do not depend on the app for safety-critical ventilation. Keep the temperature-based servo logic running on the ESP32 itself.
- For a fully offline local setup, remove the optional Google Fonts import in `styles.css` (the UI will use fallback fonts).

## Expected WebSocket JSON message
Send one JSON object per WebSocket message, ideally every 1–5 seconds:

```json
{
  "timestamp": "2026-10-26T10:00:00Z",
  "insideTemp": 32.4,
  "insideHumidity": 68.0,
  "outsideTemp": 29.8,
  "outsideHumidity": 73.0,
  "weight": 24.8,
  "soundDb": -43.2,
  "soundState": "ACTIVE",
  "servoOpen": false,
  "servoAngle": 0
}
```

Fields can be omitted when not available. The app also accepts common aliases such as `inside_temp`, `weight_kg`, and `sound_db`.

## Step 1 — Preview the app
Open `index.html` in a desktop browser. Demo mode shows sample data. Some browser security policies may restrict features when opened as a `file://` URL, but the UI itself should render.

## Step 2 — Put phone and ESP32 on the same Wi-Fi
1. Connect your ESP32 to your Wi-Fi router.
2. Print `WiFi.localIP()` to the Arduino Serial Monitor.
3. Connect your phone and laptop to that same local network.
4. Enter the ESP32 IP in Settings, e.g. `192.168.1.50`, then click **Save & connect**.

## Step 3 — Add WebSocket to your existing ESP32 firmware
Use the maintained `ESPAsyncWebServer` library and its ESP32 async TCP dependency. Install the current compatible versions from the Arduino Library Manager or official project instructions:
- https://github.com/ESP32Async/ESPAsyncWebServer
- https://github.com/ESP32Async/AsyncTCP

Add a WebSocket endpoint at `/ws`, then send the JSON payload above to connected clients. Your current BeeBot firmware already has the `/ws` WebSocket endpoint and broadcasts the expected fields. With the DHT22 update, the inside and outside readings should be published as `insideTemp`, `insideHumidity`, `outsideTemp`, and `outsideHumidity`. Keep sensor sampling and automatic ventilation logic on the ESP32.

Conceptual integration pattern (adapt variable names to your actual code):

```cpp
// Global objects (include the appropriate library headers)
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// In setup(), after Wi-Fi connects:
server.addHandler(&ws);
server.begin();

// In your existing loop(), after your current variables have updated:
static unsigned long lastPublish = 0;
if (millis() - lastPublish >= 2000) {
  lastPublish = millis();

  // Replace these example variables with your existing measured values.
  String json = "{";
  json += "\"timestamp\":" + String(millis()) + ",";
  json += "\"insideTemp\":" + String(insideTemp, 2) + ",";
  json += "\"insideHumidity\":" + String(insideHumidity, 1) + ",";
  json += "\"outsideTemp\":" + String(outsideTemp, 2) + ",";
  json += "\"outsideHumidity\":" + String(outsideHumidity, 1) + ",";
  json += "\"weight\":" + String(hiveWeight, 2) + ",";
  json += "\"soundDb\":" + String(soundDbfs, 1) + ",";
  json += "\"soundState\":\"" + String(soundState) + "\",";
  json += "\"servoOpen\":" + String(ventOpen ? "true" : "false") + ",";
  json += "\"servoAngle\":" + String(ventOpen ? 180 : 0);
  json += "}";
  ws.textAll(json);
  ws.cleanupClients();
}
```

The variable names above are placeholders, not names guaranteed to exist in your sketch. Ensure missing/invalid sensor values are handled before publishing; do not send invalid numeric values such as `nan`.

### Timestamp note
The example above uses `millis()` only as a simple demonstration. For real wall-clock time, sync the ESP32 using NTP if internet is available during setup, or let the browser timestamp incoming readings. If the local network has no internet, the dashboard can still work; time synchronization is a separate concern.

## Step 4 — Verify messages
Open the browser developer console and confirm the WebSocket connects and JSON messages arrive. If connection fails:
- Confirm the ESP32 IP and that port 80 is reachable.
- Confirm the firmware registered `/ws`.
- Check that router/client isolation is disabled for devices on your Wi-Fi.
- Ensure the browser is not opening the app from an HTTPS origin while trying to use insecure `ws://`; for simplest local testing, serve the app from the ESP32 itself or use an appropriate secure setup.

## Step 5 — Camera
The camera stream URL is independent from the sensor WebSocket. Put the actual stream URL in Settings. If the ESP32-CAM offers an MJPEG HTTP stream, use that exact endpoint. If the browser reports a format error, the camera may require a compatible viewer/relay. Keep camera networking separate from the hive-control loop.

## Recommended next build milestone
Send your current BeeBot `.ino` code so the WebSocket publishing can be integrated without breaking the two DHT22 sensors, HX711, INMP441, or servo logic. Then add persistent shared history (e.g. a local Raspberry Pi server) if you want phone and laptop to see the same records.


## BeeBot DHT22 connection quick test
1. Upload the current BeeBot ESP32 firmware with the two DHT22 sensors on GPIO 21 (inside DATA) and GPIO 22 (outside DATA).
2. Open Arduino Serial Monitor at 115200 baud and copy the IP address printed after `Wi-Fi connected. ESP32 IP:`.
3. Open `index.html` in a browser on the same Wi-Fi network, then open **Connection settings**.
4. Enter only the ESP32 IP address (for example `172.20.10.2`) and click **Save & connect**.
5. Return to **Hive overview**. The status should show LIVE and values should update as WebSocket messages arrive.
6. If the status says connected but readings remain blank, inspect Serial Monitor and the browser console. The firmware must send valid JSON to `/ws`; unavailable values should be JSON `null`, not the text `nan`.

The dashboard now labels both environmental sensors as DHT22 and treats JSON `null` values as unavailable instead of incorrectly displaying them as zero.

## Install BeeBot Connect as a Progressive Web App (PWA)

This project now includes `manifest.json`, `service-worker.js`, and 192/512 px app icons. The service worker caches the app shell so the interface can open offline; live sensor data still requires the ESP32 and Wi-Fi connection.

### Hosting and installation

1. Upload the entire `BeeBot_Connect_MVP` folder to a static host that serves the site over **HTTPS** (for example, a static website host), or run it on `localhost` during development. Keep `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, and `icons/` together.
2. Open the HTTPS website on your phone using Chrome or another supported browser.
3. Use the browser's **Install app** prompt/button, or its menu option such as **Install app** / **Add to Home Screen**.
4. Open the installed BeeBot app and enter the ESP32 IP address in **Connection settings**.

### Important: preserving the live ESP32 WebSocket

The current firmware uses an unencrypted local WebSocket at `ws://<ESP32-IP>/ws`. This works when the website is opened in a compatible local/insecure context, as you have tested. However, browsers generally block an HTTPS-installed PWA from connecting to an insecure `ws://` endpoint as mixed content. The PWA shell can install and open offline, but that alone does **not** guarantee live sensor access from the installed HTTPS app.

To keep live data working in the installed PWA, the recommended next step is a small same-network gateway (for example, on a Raspberry Pi) that serves the dashboard over HTTPS and securely proxies WebSocket traffic to the ESP32. Another option is to configure secure `wss://` on the device/gateway. Do not simply change `ws://` to `wss://` unless the endpoint actually supports TLS. Keep automatic ventilation control on the ESP32.

For now, you can continue using the existing working local page as before; the PWA additions do not change the JSON fields or `/ws` connection code.
