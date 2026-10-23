package com.example.navigationglasses

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import java.util.UUID

// Public calls and all state changes run on the main looper.
object BleGlassesManager {
    private val SERVICE_UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    private val RX_UUID = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var appContext: Context
    private var bluetoothGatt: BluetoothGatt? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    private var scanning = false
    private var pendingCommand: Byte? = null
    private var writing = false
    private var writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    private val scanTimeout = Runnable {
        stopScan()
        status("Glasses not found; try again")
    }
    private val connectionTimeout = Runnable {
        disconnect()
        status("BLE connection timed out; try again")
    }
    private val writeTimeout = Runnable {
        disconnect()
        status("BLE write timed out; reconnect glasses")
    }

    var statusListener: ((String) -> Unit)? = null

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private fun bluetoothAdapter(): BluetoothAdapter? =
        appContext.getSystemService(BluetoothManager::class.java)?.adapter

    private fun hasPermission(permission: String) =
        ContextCompat.checkSelfPermission(appContext, permission) == PackageManager.PERMISSION_GRANTED

    private fun canConnect() = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        hasPermission(Manifest.permission.BLUETOOTH_CONNECT)

    private fun canScan() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        hasPermission(Manifest.permission.BLUETOOTH_SCAN) && canConnect()
    } else {
        hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    @SuppressLint("MissingPermission")
    fun scanAndConnect() {
        if (!canScan()) {
            status("Location/Bluetooth permission missing")
            return
        }
        val adapter = bluetoothAdapter()
        if (adapter == null || !adapter.isEnabled) {
            status("Bluetooth is OFF")
            return
        }
        if (bluetoothGatt != null || scanning) {
            status(if (rxCharacteristic != null) "BLE READY" else "BLE connection in progress")
            return
        }
        val scanner = adapter.bluetoothLeScanner ?: run {
            status("BLE scanner unavailable")
            return
        }
        scanning = true
        status("Scanning for glasses ...")
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        try {
            scanner.startScan(listOf(filter), settings, scanCallback)
            handler.postDelayed(scanTimeout, 15_000)
        } catch (_: SecurityException) {
            stopScan()
            status("Bluetooth permission missing")
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        handler.removeCallbacks(scanTimeout)
        if (!scanning) return
        scanning = false
        if (canScan()) {
            try {
                bluetoothAdapter()?.bluetoothLeScanner?.stopScan(scanCallback)
            } catch (_: SecurityException) {
                // Permission can be revoked while a scan is running.
            }
        }
    }

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            handler.post {
                if (!scanning) return@post
                stopScan()
                if (!canConnect()) return@post
                status("Found glasses; connecting ...")
                try {
                    bluetoothGatt = result.device.connectGatt(
                        appContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE
                    )
                    handler.postDelayed(connectionTimeout, 15_000)
                } catch (_: SecurityException) {
                    disconnect()
                    status("Bluetooth permission missing")
                }
            }
        }

        override fun onScanFailed(errorCode: Int) {
            handler.post {
                stopScan()
                status("BLE scan failed: $errorCode")
            }
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, statusCode: Int, newState: Int) {
            handler.post {
                if (gatt !== bluetoothGatt) return@post
                if (statusCode != BluetoothGatt.GATT_SUCCESS || newState == BluetoothProfile.STATE_DISCONNECTED) {
                    disconnect()
                    status("BLE disconnected (status $statusCode)")
                } else if (newState == BluetoothProfile.STATE_CONNECTED) {
                    status("BLE connected; discovering service ...")
                    if (!canConnect() || !gatt.discoverServices()) {
                        disconnect()
                        status("Could not discover BLE services; try again")
                    }
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, statusCode: Int) {
            handler.post {
                if (gatt !== bluetoothGatt) return@post
                val rx = gatt.getService(SERVICE_UUID)?.getCharacteristic(RX_UUID)
                if (statusCode != BluetoothGatt.GATT_SUCCESS || rx == null) {
                    disconnect()
                    status("Navigation BLE service unavailable; try again")
                    return@post
                }
                writeType = when {
                    rx.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0 ->
                        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    rx.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0 ->
                        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    else -> {
                        disconnect()
                        status("BLE characteristic is not writable")
                        return@post
                    }
                }
                handler.removeCallbacks(connectionTimeout)
                rxCharacteristic = rx
                status("BLE READY")
                sendCommand(ManeuverMapper.CMD_OFF)
            }
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, statusCode: Int) {
            handler.post {
                if (gatt !== bluetoothGatt) return@post
                handler.removeCallbacks(writeTimeout)
                writing = false
                if (statusCode != BluetoothGatt.GATT_SUCCESS) {
                    disconnect()
                    status("BLE write failed: $statusCode; reconnect glasses")
                } else {
                    writePendingCommand()
                }
            }
        }
    }

    fun sendCommand(command: Byte): Boolean {
        if (!canConnect() || bluetoothGatt == null || rxCharacteristic == null) return false
        // Keep only the newest command while a previous write completes.
        pendingCommand = command
        return writePendingCommand()
    }

    @SuppressLint("MissingPermission")
    private fun writePendingCommand(): Boolean {
        if (writing) return true
        val command = pendingCommand ?: return true
        val gatt = bluetoothGatt ?: return false
        val characteristic = rxCharacteristic ?: return false
        if (!canConnect()) return false
        writing = true
        val started = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeCharacteristic(characteristic, byteArrayOf(command), writeType) == BluetoothStatusCodes.SUCCESS
            } else {
                @Suppress("DEPRECATION")
                characteristic.writeType = writeType
                @Suppress("DEPRECATION")
                characteristic.value = byteArrayOf(command)
                @Suppress("DEPRECATION")
                gatt.writeCharacteristic(characteristic)
            }
        } catch (_: SecurityException) {
            false
        }
        if (started) {
            pendingCommand = null
            handler.postDelayed(writeTimeout, 5_000)
        } else {
            disconnect()
            status("BLE write could not start; reconnect glasses")
        }
        return started
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        stopScan()
        handler.removeCallbacks(connectionTimeout)
        handler.removeCallbacks(writeTimeout)
        val gatt = bluetoothGatt
        bluetoothGatt = null
        rxCharacteristic = null
        pendingCommand = null
        writing = false
        try {
            if (canConnect()) gatt?.disconnect()
            gatt?.close()
        } catch (_: SecurityException) {
            // State is cleared even if the user has revoked Bluetooth permission.
        }
    }

    private fun status(message: String) {
        statusListener?.invoke(message)
    }
}
