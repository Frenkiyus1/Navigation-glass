package com.example.navigationglasses

import android.app.Service
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import com.google.android.libraries.mapsplatform.turnbyturn.TurnByTurnManager
import com.google.android.libraries.mapsplatform.turnbyturn.model.NavState

class NavInfoReceivingService : Service() {
    private lateinit var messenger: Messenger
    private lateinit var turnByTurnManager: TurnByTurnManager
    private lateinit var handler: Handler

    companion object {
        // Accessed on the main looper by both the activity and this service.
        var guidanceActive = false
    }

    override fun onCreate() {
        super.onCreate()
        turnByTurnManager = TurnByTurnManager.createInstance()
        handler = object : Handler(Looper.getMainLooper()) {
            override fun handleMessage(msg: Message) {
                if (msg.what != TurnByTurnManager.MSG_NAV_INFO) return
                val navInfo = turnByTurnManager.readNavInfoFromBundle(msg.data)
                val command = TurnAlertPolicy.commandFor(
                    guidanceActive && navInfo.navState == NavState.ENROUTE,
                    navInfo.currentStep?.maneuver,
                    navInfo.distanceToCurrentStepMeters
                )
                // The feed runs once per second. Repeating commands restores the
                // display after reconnecting and refreshes the firmware watchdog.
                BleGlassesManager.sendCommand(command)
            }
        }
        messenger = Messenger(handler)
    }

    override fun onBind(intent: Intent?): IBinder = messenger.binder

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        BleGlassesManager.sendCommand(ManeuverMapper.CMD_OFF)
        super.onDestroy()
    }
}
