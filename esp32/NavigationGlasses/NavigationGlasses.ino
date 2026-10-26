#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#define LED_LEFT  1
#define LED_RIGHT 20

#define SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define RX_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"

#define CMD_OFF      0x00
#define CMD_LEFT     0x01
#define CMD_RIGHT    0x02
#define CMD_STRAIGHT 0x03
#define CMD_UTURN    0x04

const unsigned long BLINK_MS = 300;
const unsigned long COMMAND_TIMEOUT_MS = 5000;
portMUX_TYPE commandMux = portMUX_INITIALIZER_UNLOCKED;
uint8_t currentCommand = CMD_OFF;
unsigned long lastCommandReceived = 0;
uint8_t displayedCommand = CMD_OFF;
bool blinkState = false;
unsigned long lastBlink = 0;

void allOff() {
  digitalWrite(LED_LEFT, LOW);
  digitalWrite(LED_RIGHT, LOW);
}

void receiveCommand(uint8_t command) {
  portENTER_CRITICAL(&commandMux);
  currentCommand = command <= CMD_UTURN ? command : CMD_OFF;
  lastCommandReceived = millis();
  portEXIT_CRITICAL(&commandMux);
}

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    const auto value = c->getValue();
    // Each packet is exactly one byte, including OFF (0x00).
    const uint8_t command = value.length() == 1 ? (uint8_t)value[0] : CMD_OFF;
    receiveCommand(command);
    Serial.printf("Command: 0x%02X\n", command);
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    Serial.println("BLE connected");
  }
  void onDisconnect(BLEServer *server) override {
    receiveCommand(CMD_OFF);
    Serial.println("BLE disconnected; restarting advertising");
    BLEDevice::startAdvertising();
  }
};

void updateLEDs() {
  portENTER_CRITICAL(&commandMux);
  uint8_t command = currentCommand;
  const unsigned long receivedAt = lastCommandReceived;
  portEXIT_CRITICAL(&commandMux);
  const unsigned long now = millis();

  // The Android feed refreshes once per second. Clear stale guidance if
  // updates stop even while the BLE link remains connected.
  if (now - receivedAt >= COMMAND_TIMEOUT_MS) command = CMD_OFF;
  if (command != displayedCommand) {
    displayedCommand = command;
    blinkState = true;
    lastBlink = now;
  } else if (now - lastBlink >= BLINK_MS) {
    lastBlink = now;
    blinkState = !blinkState;
  }

  // Only the Arduino loop writes LEDs or changes blink state. BLE callbacks
  // publish commands under the lock, avoiding races with this loop.
  switch (command) {
    case CMD_LEFT:
      digitalWrite(LED_LEFT, blinkState);
      digitalWrite(LED_RIGHT, LOW);
      break;
    case CMD_RIGHT:
      digitalWrite(LED_LEFT, LOW);
      digitalWrite(LED_RIGHT, blinkState);
      break;
    case CMD_STRAIGHT:
      digitalWrite(LED_LEFT, blinkState);
      digitalWrite(LED_RIGHT, blinkState);
      break;
    case CMD_UTURN:
      digitalWrite(LED_LEFT, blinkState);
      digitalWrite(LED_RIGHT, !blinkState);
      break;
    default:
      allOff();
      break;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_LEFT, OUTPUT);
  pinMode(LED_RIGHT, OUTPUT);
  allOff();

  Serial.println("Initializing NavigationGlasses BLE...");
  if (!BLEDevice::init("NavigationGlasses")) {
    Serial.println("ERROR: BLE init failed. Check power and reset the ESP32.");
    return;
  }
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *rx = service->createCharacteristic(
    RX_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  rx->setCallbacks(new RxCallbacks());
  service->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  // The full name and 128-bit UUID do not fit together in a legacy packet.
  // Allow the name to be sent in the scan response instead of truncating it.
  adv->setScanResponse(true);
  if (!adv->start()) {
    Serial.println("ERROR: BLE advertising request failed. Reset the ESP32.");
    return;
  }

  Serial.println("BLE advertising requested: NavigationGlasses");
  Serial.println("Service: " SERVICE_UUID);
}

void loop() {
  updateLEDs();
  delay(5);
}
