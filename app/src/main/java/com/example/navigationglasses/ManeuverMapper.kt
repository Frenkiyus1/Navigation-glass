package com.example.navigationglasses

import com.google.android.libraries.mapsplatform.turnbyturn.model.Maneuver

object ManeuverMapper {
    const val CMD_OFF: Byte = 0x00
    const val CMD_LEFT: Byte = 0x01
    const val CMD_RIGHT: Byte = 0x02
    const val CMD_STRAIGHT: Byte = 0x03
    const val CMD_UTURN: Byte = 0x04

    fun toBleCommand(maneuver: Int): Byte = when (maneuver) {
        Maneuver.TURN_LEFT,
        Maneuver.TURN_SLIGHT_LEFT,
        Maneuver.TURN_SHARP_LEFT,
        Maneuver.TURN_KEEP_LEFT,
        Maneuver.FORK_LEFT,
        Maneuver.MERGE_LEFT,
        Maneuver.ON_RAMP_LEFT,
        Maneuver.ON_RAMP_SLIGHT_LEFT,
        Maneuver.ON_RAMP_SHARP_LEFT,
        Maneuver.ON_RAMP_KEEP_LEFT,
        Maneuver.OFF_RAMP_LEFT,
        Maneuver.OFF_RAMP_SLIGHT_LEFT,
        Maneuver.OFF_RAMP_SHARP_LEFT,
        Maneuver.OFF_RAMP_KEEP_LEFT,
        Maneuver.ROUNDABOUT_LEFT_CLOCKWISE,
        Maneuver.ROUNDABOUT_LEFT_COUNTERCLOCKWISE,
        Maneuver.ROUNDABOUT_SLIGHT_LEFT_CLOCKWISE,
        Maneuver.ROUNDABOUT_SLIGHT_LEFT_COUNTERCLOCKWISE,
        Maneuver.ROUNDABOUT_SHARP_LEFT_CLOCKWISE,
        Maneuver.ROUNDABOUT_SHARP_LEFT_COUNTERCLOCKWISE -> CMD_LEFT

        Maneuver.TURN_RIGHT,
        Maneuver.TURN_SLIGHT_RIGHT,
        Maneuver.TURN_SHARP_RIGHT,
        Maneuver.TURN_KEEP_RIGHT,
        Maneuver.FORK_RIGHT,
        Maneuver.MERGE_RIGHT,
        Maneuver.ON_RAMP_RIGHT,
        Maneuver.ON_RAMP_SLIGHT_RIGHT,
        Maneuver.ON_RAMP_SHARP_RIGHT,
        Maneuver.ON_RAMP_KEEP_RIGHT,
        Maneuver.OFF_RAMP_RIGHT,
        Maneuver.OFF_RAMP_SLIGHT_RIGHT,
        Maneuver.OFF_RAMP_SHARP_RIGHT,
        Maneuver.OFF_RAMP_KEEP_RIGHT,
        Maneuver.ROUNDABOUT_RIGHT_CLOCKWISE,
        Maneuver.ROUNDABOUT_RIGHT_COUNTERCLOCKWISE,
        Maneuver.ROUNDABOUT_SLIGHT_RIGHT_CLOCKWISE,
        Maneuver.ROUNDABOUT_SLIGHT_RIGHT_COUNTERCLOCKWISE,
        Maneuver.ROUNDABOUT_SHARP_RIGHT_CLOCKWISE,
        Maneuver.ROUNDABOUT_SHARP_RIGHT_COUNTERCLOCKWISE -> CMD_RIGHT

        Maneuver.TURN_U_TURN_CLOCKWISE,
        Maneuver.TURN_U_TURN_COUNTERCLOCKWISE,
        Maneuver.ON_RAMP_U_TURN_CLOCKWISE,
        Maneuver.ON_RAMP_U_TURN_COUNTERCLOCKWISE,
        Maneuver.OFF_RAMP_U_TURN_CLOCKWISE,
        Maneuver.OFF_RAMP_U_TURN_COUNTERCLOCKWISE,
        Maneuver.ROUNDABOUT_U_TURN_CLOCKWISE,
        Maneuver.ROUNDABOUT_U_TURN_COUNTERCLOCKWISE -> CMD_UTURN

        Maneuver.STRAIGHT,
        Maneuver.DEPART,
        Maneuver.NAME_CHANGE,
        Maneuver.MERGE_UNSPECIFIED,
        Maneuver.ON_RAMP_UNSPECIFIED,
        Maneuver.OFF_RAMP_UNSPECIFIED,
        Maneuver.ROUNDABOUT_STRAIGHT_CLOCKWISE,
        Maneuver.ROUNDABOUT_STRAIGHT_COUNTERCLOCKWISE -> CMD_STRAIGHT

        else -> CMD_OFF
    }
}
