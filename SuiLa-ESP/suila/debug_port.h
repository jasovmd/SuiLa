#pragma once

#include <Arduino.h>

// ESP32-C3 的 COM 埠是內建 USB。預設 Serial 走 GPIO20/21，監控視窗會是空的。
// 核心 3.x 只有打開 USB CDC On Boot 才會提供 USBSerial，所以這裡自己建立 HWCDC。
#if defined(ARDUINO_USB_MODE) && ARDUINO_USB_MODE == 1 && !ARDUINO_USB_CDC_ON_BOOT
#include "HWCDC.h"

class BoardConsole : public Stream {
 public:
  void begin(unsigned long baud) {
    Serial.begin(baud);
    usb_.begin(baud);
  }
  int available() override {
    if (usb_.available()) {
      return usb_.available();
    }
    return Serial.available();
  }
  int read() override {
    if (usb_.available()) {
      return usb_.read();
    }
    return Serial.read();
  }
  int peek() override {
    if (usb_.available()) {
      return usb_.peek();
    }
    return Serial.peek();
  }
  void flush() override {
    Serial.flush();
    usb_.flush();
  }
  size_t write(uint8_t c) override {
    Serial.write(c);
    return usb_.write(c);
  }

 private:
  HWCDC usb_;
};

inline BoardConsole &boardConsole() {
  static BoardConsole console;
  return console;
}

#define CONSOLE boardConsole()
#else
#define CONSOLE Serial
#endif
