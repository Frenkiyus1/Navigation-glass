package com.example.navigationglasses

object TurnAlertPolicy {
    const val TURN_ALERT_DISTANCE_METERS = 180

    fun commandFor(isEnroute: Boolean, maneuver: Int?, distanceMeters: Int?): Byte {
        if (!isEnroute || maneuver == null || distanceMeters == null ||
            distanceMeters !in 0..TURN_ALERT_DISTANCE_METERS
        ) return ManeuverMapper.CMD_OFF
        return ManeuverMapper.toBleCommand(maneuver)
    }
}
