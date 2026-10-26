export const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

function timeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

export class GlassesBluetooth {
  constructor(bluetooth, onStatus = () => {}) {
    this.bluetooth = bluetooth;
    this.onStatus = onStatus;
    this.device = null;
    this.characteristic = null;
    this.pending = null;
    this.writing = false;
    this.connecting = false;
    this.generation = 0;
  }
  get connected() { return Boolean(this.characteristic && this.device?.gatt?.connected); }
  async connect() {
    if (!this.bluetooth) throw new Error('Hãy mở bằng Chrome trên Android hoặc Chrome/Edge trên máy tính để kết nối kính.');
    if (this.connecting || this.connected) return;
    this.connecting = true;
    this.onStatus('connecting', 'Đang chọn kính…');
    let generation = ++this.generation;
    try {
      // Must be called directly from a user's click, before any awaited operation.
      // Separate filters match either the advertised service or the glasses' name.
      // Name-only matches still need permission to access the UART service.
      const device = await this.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }, { namePrefix: 'NavigationGlasses' }],
        optionalServices: [SERVICE_UUID]
      });
      if (generation !== this.generation) return;
      this.device = device;
      device.addEventListener('gattserverdisconnected', () => {
        if (device !== this.device) return;
        this.reset();
        this.onStatus('disconnected', 'Kính đã ngắt kết nối');
      }, { once: true });
      const connection = device.gatt.connect();
      connection.then(() => {
        if (generation !== this.generation && device !== this.device) device.gatt.disconnect();
      }, () => {});
      const server = await timeout(connection, 12000, 'Kết nối kính quá lâu. Hãy thử lại.');
      const service = await timeout(server.getPrimaryService(SERVICE_UUID), 6000, 'Không tìm thấy dịch vụ của kính.');
      const characteristic = await timeout(service.getCharacteristic(RX_UUID), 6000, 'Không tìm thấy kênh gửi chỉ dẫn.');
      if (generation !== this.generation) return;
      if (!characteristic.properties.write && !characteristic.properties.writeWithoutResponse) {
        throw new Error('Kính chưa có kênh nhận lệnh phù hợp.');
      }
      this.characteristic = characteristic;
      this.onStatus('connected', device.name || 'NavigationGlasses');
      await this.send(0);
    } catch (error) {
      this.disconnect();
      if (error.name !== 'NotFoundError') throw error;
      this.onStatus('disconnected', 'Chưa chọn thiết bị');
    } finally {
      this.connecting = false;
    }
  }
  async send(command) {
    if (!Number.isInteger(command) || command < 0 || command > 4) throw new TypeError('Invalid BLE command');
    if (!this.connected) return false;
    this.pending = command;
    if (this.writing) return true;
    this.writing = true;
    const generation = this.generation;
    try {
      while (this.pending !== null && this.connected && generation === this.generation) {
        const value = new Uint8Array([this.pending]);
        this.pending = null;
        const characteristic = this.characteristic;
        const write = characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse
          ? characteristic.writeValueWithoutResponse(value)
          : characteristic.writeValueWithResponse(value);
        await timeout(write, 3000, 'Kính không phản hồi. Hãy kết nối lại.');
      }
      return true;
    } catch (error) {
      if (generation === this.generation) {
        this.disconnect();
        this.onStatus('error', error.message || 'Gửi lệnh tới kính thất bại');
      }
      return false;
    } finally {
      if (generation === this.generation) this.writing = false;
    }
  }
  reset() {
    ++this.generation;
    this.device = null;
    this.characteristic = null;
    this.pending = null;
    this.writing = false;
    this.connecting = false;
  }
  disconnect() {
    const device = this.device;
    this.reset();
    if (device?.gatt?.connected) device.gatt.disconnect();
    this.onStatus('disconnected', 'Kính chưa kết nối');
  }
}
