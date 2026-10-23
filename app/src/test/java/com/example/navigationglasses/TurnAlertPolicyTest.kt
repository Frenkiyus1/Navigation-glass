package com.example.navigationglasses

import com.google.android.libraries.mapsplatform.turnbyturn.model.Maneuver
import org.junit.Assert.assertEquals
import org.junit.Test

class TurnAlertPolicyTest {
    @Test fun alertsIncludeTheDistanceBoundary() {
        assertEquals(ManeuverMapper.CMD_LEFT, TurnAlertPolicy.commandFor(true, Maneuver.TURN_LEFT, 180))
        assertEquals(ManeuverMapper.CMD_LEFT, TurnAlertPolicy.commandFor(true, Maneuver.TURN_LEFT, 0))
        assertEquals(ManeuverMapper.CMD_OFF, TurnAlertPolicy.commandFor(true, Maneuver.TURN_LEFT, 181))
    }

    @Test fun missingOrInvalidDistanceClearsTheDisplay() {
        assertEquals(ManeuverMapper.CMD_OFF, TurnAlertPolicy.commandFor(true, Maneuver.TURN_RIGHT, null))
        assertEquals(ManeuverMapper.CMD_OFF, TurnAlertPolicy.commandFor(true, Maneuver.TURN_RIGHT, -1))
    }

    @Test fun missingStepOrInactiveNavigationClearsTheDisplay() {
        assertEquals(ManeuverMapper.CMD_OFF, TurnAlertPolicy.commandFor(true, null, 20))
        assertEquals(ManeuverMapper.CMD_OFF, TurnAlertPolicy.commandFor(false, Maneuver.TURN_LEFT, 20))
    }

    @Test fun unknownManeuverClearsPreviousTurn() {
        assertEquals(ManeuverMapper.CMD_OFF, TurnAlertPolicy.commandFor(true, Int.MAX_VALUE, 20))
    }

    @Test fun maneuversMapToTheFirmwareProtocol() {
        assertEquals(0x01.toByte(), ManeuverMapper.toBleCommand(Maneuver.OFF_RAMP_SLIGHT_LEFT))
        assertEquals(0x02.toByte(), ManeuverMapper.toBleCommand(Maneuver.ROUNDABOUT_RIGHT_CLOCKWISE))
        assertEquals(0x03.toByte(), ManeuverMapper.toBleCommand(Maneuver.STRAIGHT))
        assertEquals(0x04.toByte(), ManeuverMapper.toBleCommand(Maneuver.TURN_U_TURN_COUNTERCLOCKWISE))
        assertEquals(0x00.toByte(), ManeuverMapper.toBleCommand(Int.MIN_VALUE))
    }
}
