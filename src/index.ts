import { UniBluetooth, type BluetoothResponse, type ConnectedDeviveInfo, type DeviceInfo, type GetAdapterStateResult, type GetConnectedDevicesOptions, type OnAdapterStateChangeCallback, type StartScanOptions } from '@wing-uni/bluetooth';
import { UniBluetoothLowEnergy, WriteType, type Characteristic, type OnDeviceStateChangeCalback, type OnDeviceValueChangeCalback, type Service, type WriteOptions } from '@wing-uni/bluetooth-low-energy';
import Sequence, { type PromiseHandler } from 'wing-sequence';

export function getOS() {
  const os = uni.getSystemInfoSync()?.osName;
  return {
    isIOS: os == 'ios',
    isAndroid: os == 'android',
  };
}

export type BluetoothLowEnergyConfig = {
  deviceId: string;
  serviceId?: string;
  readUUID?: string;
  writeUUID?: string;
  notifyUUID?: string;
};
export type MTU = {
  iosMTU: number;
  androidMTU: number;
};
export type DeviceConfig = {
  deviceId: string;
  serviceId: string;
  readUUID: string;
  writeUUID: string;
  notifyUUID: string;
};
export class Bluetooth {
  private static instance: Bluetooth | null = null;
  private uniBluetooth: UniBluetooth;
  private uniBluetoothLowEnergy: UniBluetoothLowEnergy;
  private services: string[];
  constructor(services?: string[]) {
    this.uniBluetooth = UniBluetooth.getInstance();
    this.uniBluetoothLowEnergy = UniBluetoothLowEnergy.getInstance();
    this.services = services ?? [];
  }
  static getInstance(services?: string[]): Bluetooth {
    if (this.instance == null) {
      this.instance = new Bluetooth(services);
    }
    return this.instance;
  }
  openAdapter(): Promise<BluetoothResponse<null>> {
    return this.uniBluetooth.openBluetoothAdapter();
  }
  startScan(options?: StartScanOptions): Promise<BluetoothResponse<null>> {
    options = options ?? { services: this.services };
    if (getOS().isIOS) {
      // options.services = []
      // Or delete services
      delete options.services;
    }

    return this.uniBluetooth.startBluetoothDevicesDiscovery(options);
  }
  onDeviceFound(callback: (device: DeviceInfo) => void): void {
    this.uniBluetooth.onBluetoothDeviceFound(({ devices }) => {
      if (devices && devices.length > 0) {
        const device = devices[0];
        if (this.checkDeviceIsInternal(device)) callback(device);
      }
    });
  }
  stopScan(): Promise<BluetoothResponse<null>> {
    return this.uniBluetooth.stopBluetoothDevicesDiscovery();
  }
  onAdapterStateChange(callback: OnAdapterStateChangeCallback): void {
    this.uniBluetooth.onBluetoothAdapterStateChange(callback);
  }
  getConnectedDevices(options?: GetConnectedDevicesOptions): Promise<BluetoothResponse<ConnectedDeviveInfo[]>> {
    options = options ?? { services: this.services };
    return this.uniBluetooth.getConnectedBluetoothDevices(options);
  }
  getDevices(): Promise<BluetoothResponse<DeviceInfo[]>> {
    return new Promise(async (resolve) => {
      let { data, succeed, message, code } = await this.uniBluetooth.getBluetoothDevices();
      if (data) {
        data = data.filter((device) => this.checkDeviceIsInternal(device));
      }
      resolve({ data, succeed, message, code });
    });
  }
  getAdapterState(): Promise<BluetoothResponse<GetAdapterStateResult>> {
    return this.uniBluetooth.getBluetoothAdapterState();
  }
  closeAdapter(): Promise<BluetoothResponse<null>> {
    return this.uniBluetooth.closeBluetoothAdapter();
  }
  private checkDeviceIsInternal(device: DeviceInfo, services?: string[]): boolean {
    services = services ?? this.services;
    if (services.length <= 0) return true;
    const { advertisServiceUUIDs } = device;
    if (advertisServiceUUIDs && services.filter((service) => advertisServiceUUIDs.indexOf(service) > -1).length > 0) {
      return true;
    }
    return false;
  }
  setServices(services: string[]) {
    this.services = services;
  }
  onDevicesFound(callback: (devices: DeviceInfo[]) => void): void {
    let devices: DeviceInfo[] = [];
    this.onDeviceFound((device) => {
      if (!devices.find((o) => o.deviceId == device.deviceId)) {
        devices.unshift(device);
        callback(devices);
      }
    });
  }
  onStateChange(callback: OnDeviceStateChangeCalback): void {
    this.uniBluetoothLowEnergy.onBLEConnectionStateChange(callback);
  }
  onValueChange(callback: OnDeviceValueChangeCalback): void {
    this.uniBluetoothLowEnergy.onBLECharacteristicValueChange(callback);
  }
}
export class BluetoothLowEnergy {
  private static instance: BluetoothLowEnergy | null = null;
  private config: BluetoothLowEnergyConfig;
  private uniBle: UniBluetoothLowEnergy;
  private mtu: MTU;

  constructor(config: BluetoothLowEnergyConfig, mtu?: MTU) {
    this.config = config;
    this.uniBle = UniBluetoothLowEnergy.getInstance();
    this.mtu = mtu ?? { iosMTU: 256, androidMTU: 20 };
  }
  static getInstance(config: BluetoothLowEnergyConfig, mtu?: MTU): BluetoothLowEnergy {
    if (this.instance == null) {
      this.instance = new BluetoothLowEnergy(config, mtu);
    }
    return this.instance;
  }
  setMTU(mtu: number): Promise<BluetoothResponse<null>> {
    const { deviceId } = this.config;
    if (getOS().isIOS) {
      return Promise.resolve({ succeed: true, message: 'ok: ios may not support setMTU' });
    }
    return this.uniBle.setBLEMTU({ deviceId, mtu });
  }
  write(value: ArrayBuffer, serviceId?: string, characteristicId?: string, writeType?: WriteType): Promise<BluetoothResponse<null>> {
    const { isIOS } = getOS();
    serviceId = serviceId ?? this.config.serviceId ?? '';

    characteristicId = characteristicId ?? this.config.writeUUID ?? '';
    writeType = writeType ?? isIOS ? WriteType.Write : WriteType.WriteNoResponse;
    let options = { deviceId: this.config.deviceId, serviceId, characteristicId, value, writeType };
    const offset = isIOS ? this.mtu.iosMTU : this.mtu.androidMTU;
    if (value.byteLength > offset) {
      return this.writeLong(options, offset);
    }
    return this.writeShort(options);
  }
  read(serviceId?: string, characteristicId?: string): Promise<BluetoothResponse<null>> {
    serviceId = serviceId ?? this.config.serviceId ?? '';
    characteristicId = characteristicId ?? this.config.readUUID ?? '';
    let options = { deviceId: this.config.deviceId, serviceId, characteristicId };
    return this.uniBle.readBLECharacteristicValue(options);
  }
  //
  onStateChange(callback: (connected: boolean) => void): void {
    this.uniBle.onBLEConnectionStateChange(({ connected, deviceId }) => {
      if (deviceId == this.config.deviceId) callback(connected);
    });
  }
  onValueChange(callback: (value: ArrayBuffer) => void, serviceId?: string, characteristicId?: string): void {
    serviceId = serviceId ?? this.config.serviceId;
    characteristicId = characteristicId ?? this.config.notifyUUID;
    this.uniBle.onBLECharacteristicValueChange(({ deviceId, ...rest }) => {
      if (deviceId != this.config.deviceId || (serviceId && serviceId != rest.serviceId) || (characteristicId && characteristicId != rest.characteristicId)) {
        return;
      }
      callback(rest.value);
    });
  }
  //
  notify(serviceId?: string, characteristicId?: string, state?: boolean): Promise<BluetoothResponse<null>> {
    serviceId = serviceId ?? this.config.serviceId ?? '';
    characteristicId = characteristicId ?? this.config.notifyUUID ?? '';
    state = state ?? true;
    let options = { deviceId: this.config.deviceId, serviceId, characteristicId, state };
    return this.uniBle.notifyBLECharacteristicValueChange(options);
  }
  getServices(): Promise<BluetoothResponse<Service[]>> {
    return this.uniBle.getBLEDeviceServices({ deviceId: this.config.deviceId });
  }
  getRSSI(): Promise<BluetoothResponse<number>> {
    return this.uniBle.getBLEDeviceRSSI({ deviceId: this.config.deviceId });
  }
  getCharacteristics(serviceId?: string): Promise<BluetoothResponse<Characteristic[]>> {
    serviceId = serviceId ?? this.config.serviceId ?? '';
    let options = { deviceId: this.config.deviceId, serviceId };
    return this.uniBle.getBLEDeviceCharacteristics(options);
  }
  connect(timeout?: number): Promise<BluetoothResponse<null>> {
    return this.uniBle.createBLEConnection({ deviceId: this.config.deviceId, timeout });
  }
  disConnect(): Promise<BluetoothResponse<null>> {
    return this.uniBle.closeBLEConnection({ deviceId: this.config.deviceId });
  }

  private writeShort(options: WriteOptions): Promise<BluetoothResponse<null>> {
    return this.uniBle.writeBLECharacteristicValue(options);
  }
  private writeLong(options: WriteOptions, offset: number): Promise<BluetoothResponse<null>> {
    const { value } = options;
    let sequence = new Sequence<PromiseHandler<boolean>>();
    for (let i = 0; i < Math.ceil(value.byteLength / offset); i++) {
      ((j) => {
        const _value = value.slice(j * offset, (j + 1) * offset);
        sequence.push((preSucceed: boolean) => {
          return new Promise(async (resolve) => {
            const { succeed } = await this.writeShort({ ...options, value: _value });
            resolve(preSucceed && succeed);
          });
        });
      })(i);
    }
    return Promise.resolve({ succeed: true });
  }
}
export class BluetoothLowEnergyDevice {
  private ble: BluetoothLowEnergy;
  constructor(config: DeviceConfig) {
    this.ble = BluetoothLowEnergy.getInstance(config);
  }
  setMTU(mtu: number): Promise<BluetoothResponse<null>> {
    return this.ble.setMTU(mtu);
  }
  write(value: ArrayBuffer): Promise<BluetoothResponse<null>> {
    return this.ble.write(value);
  }
  read(): Promise<BluetoothResponse<null>> {
    return this.ble.read();
  }
  //
  onStateChange(callback: (connected: boolean) => void): void {
    this.ble.onStateChange(callback);
  }
  onValueChange(callback: (value: ArrayBuffer) => void): void {
    this.ble.onValueChange(callback);
  }
  //
  notify(): Promise<BluetoothResponse<null>> {
    return this.ble.notify();
  }
  getServices(): Promise<BluetoothResponse<Service[]>> {
    return this.ble.getServices();
  }
  getRSSI(): Promise<BluetoothResponse<number>> {
    return this.ble.getRSSI();
  }
  getCharacteristics(): Promise<BluetoothResponse<Characteristic[]>> {
    return this.ble.getCharacteristics();
  }
  connect(timeout?: number): Promise<BluetoothResponse<null>> {
    return this.ble.connect(timeout);
  }
  disConnect(): Promise<BluetoothResponse<null>> {
    return this.ble.disConnect();
  }
}
export default BluetoothLowEnergy;
