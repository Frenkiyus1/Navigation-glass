package com.example.navigationglasses

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.libraries.navigation.*

class MainActivity : AppCompatActivity() {
    private var navigator: Navigator? = null
    private lateinit var navFragment: SupportNavigationFragment
    private var destination: LatLng? = null
    private var destinationMarker: Marker? = null
    private var navUpdatesRegistered = false
    private var initializing = false
    private var routeRequestId = 0
    private val arrivalListener = Navigator.ArrivalListener { event ->
        if (event.isFinalDestination) {
            stopRoute()
            txtNav.text = "Navigation: arrived"
        }
    }

    private lateinit var txtBle: TextView
    private lateinit var txtDestination: TextView
    private lateinit var txtNav: TextView

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            if (hasCorePermissions()) initializeNavigation()
            else toast("Location/Bluetooth permission is required")
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        navFragment = supportFragmentManager
            .findFragmentById(R.id.navigation_fragment) as SupportNavigationFragment

        txtBle = findViewById(R.id.txtBle)
        txtDestination = findViewById(R.id.txtDestination)
        txtNav = findViewById(R.id.txtNav)

        findViewById<Button>(R.id.btnBle).setOnClickListener {
            if (hasCorePermissions()) BleGlassesManager.scanAndConnect()
            else requestNeededPermissions()
        }

        findViewById<Button>(R.id.btnStart).setOnClickListener {
            startRoute()
        }

        findViewById<Button>(R.id.btnSimulate).setOnClickListener {
            val nav = navigator
            if (nav == null || !nav.isGuidanceRunning) {
                toast("Start a route first")
            } else {
                nav.getSimulator().simulateLocationsAlongExistingRoute(
                    SimulationOptions().speedMultiplier(5f)
                )
                txtNav.text = "Navigation: SIMULATION 5x"
            }
        }

        findViewById<Button>(R.id.btnStop).setOnClickListener {
            stopRoute()
        }

        BleGlassesManager.statusListener = { message ->
            runOnUiThread { txtBle.text = "BLE: $message" }
        }

        requestNeededPermissions()
    }

    private fun requestNeededPermissions() {
        val permissions = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            // Android 12+ requires both permissions in the same runtime request.
            permissions += Manifest.permission.ACCESS_FINE_LOCATION
            permissions += Manifest.permission.ACCESS_COARSE_LOCATION
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions += Manifest.permission.BLUETOOTH_SCAN
            permissions += Manifest.permission.BLUETOOTH_CONNECT
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions += Manifest.permission.POST_NOTIFICATIONS
        }

        val missing = permissions.filter {
            it == Manifest.permission.ACCESS_COARSE_LOCATION ||
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isEmpty()) initializeNavigation()
        else permissionLauncher.launch(missing.toTypedArray())
    }

    private fun hasCorePermissions(): Boolean {
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) return false
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) return false
        }

        return true
    }

    @SuppressLint("MissingPermission")
    private fun initializeNavigation() {
        if (navigator != null || initializing || isDestroyed) return
        if (BuildConfig.MAPS_API_KEY.isBlank() || BuildConfig.MAPS_API_KEY == "DEFAULT_API_KEY") {
            txtNav.text = "Navigation: configure MAPS_API_KEY in local.properties"
            return
        }
        initializing = true

        txtNav.text = "Navigation: initializing Google Navigation SDK ..."

        NavigationApi.getNavigator(
            this,
            object : NavigationApi.NavigatorListener {
                override fun onNavigatorReady(readyNavigator: Navigator) {
                    initializing = false
                    if (isDestroyed) {
                        readyNavigator.cleanup()
                        return
                    }
                    navigator = readyNavigator
                    txtNav.text = "Navigation: ready; long-press map to choose destination"

                    navFragment.setNavigationUiEnabled(true)
                    navFragment.setTripProgressBarEnabled(true)

                    navFragment.getMapAsync { map ->
                        if (isDestroyed || !hasCorePermissions()) return@getMapAsync
                        map.isMyLocationEnabled = true

                        map.setOnMapLongClickListener { latLng ->
                            destination = latLng
                            destinationMarker?.remove()
                            destinationMarker = map.addMarker(
                                MarkerOptions()
                                    .position(latLng)
                                    .title("Destination")
                            )
                            txtDestination.text =
                                "Destination: %.6f, %.6f".format(latLng.latitude, latLng.longitude)
                        }
                    }

                    readyNavigator.addArrivalListener(arrivalListener)
                }

                override fun onError(@NavigationApi.ErrorCode errorCode: Int) {
                    initializing = false
                    if (isDestroyed) return
                    txtNav.text = "Navigation SDK error: $errorCode"
                    toast(
                        when (errorCode) {
                            NavigationApi.ErrorCode.NOT_AUTHORIZED ->
                                "API key is not authorized for Navigation SDK"
                            NavigationApi.ErrorCode.TERMS_NOT_ACCEPTED ->
                                "Google Navigation terms were not accepted"
                            else -> "Navigation SDK error: $errorCode"
                        }
                    )
                }
            }
        )
    }

    private fun startRoute() {
        val nav = navigator ?: run {
            toast("Navigation SDK is not ready")
            return
        }

        val target = destination ?: run {
            toast("Long-press the map to select a destination")
            return
        }

        stopRoute()
        val requestId = routeRequestId
        val waypoint = Waypoint.builder()
            .setLatLng(target.latitude, target.longitude)
            .setTitle("Destination")
            .build()

        val routingOptions = RoutingOptions()
            .travelMode(RoutingOptions.TravelMode.TWO_WHEELER)

        txtNav.text = "Navigation: calculating two-wheeler route ..."

        val pendingRoute = nav.setDestination(waypoint, routingOptions)
        pendingRoute.setOnResultListener(
            object : ListenableResultFuture.OnResultListener<Navigator.RouteStatus> {
                override fun onResult(code: Navigator.RouteStatus) {
                    if (isDestroyed || requestId != routeRequestId) return
                    when (code) {
                        Navigator.RouteStatus.OK -> {
                            if (!registerTurnByTurnFeed(nav)) {
                                nav.clearDestinations()
                                txtNav.text = "Navigation: could not register turn-by-turn feed"
                                return
                            }

                            val audio = AudioGuidanceSettings.builder()
                                .setGuidanceMode(
                                    AudioGuidanceSettings.GuidanceMode.VOICE_ALERTS_AND_GUIDANCE
                                )
                                .build()
                            nav.setAudioGuidanceSettings(audio)
                            NavInfoReceivingService.guidanceActive = true
                            nav.startGuidance()
                            txtNav.text = "Navigation: GUIDANCE RUNNING"
                        }

                        Navigator.RouteStatus.NO_ROUTE_FOUND ->
                            txtNav.text = "Navigation: no route found"

                        Navigator.RouteStatus.NETWORK_ERROR ->
                            txtNav.text = "Navigation: network error"

                        Navigator.RouteStatus.ROUTE_CANCELED ->
                            txtNav.text = "Navigation: route canceled"

                        else -> txtNav.text = "Navigation route error: $code"
                    }
                }
            }
        )
    }

    private fun registerTurnByTurnFeed(nav: Navigator): Boolean {
        if (navUpdatesRegistered) return true

        navUpdatesRegistered = nav.registerServiceForNavUpdates(
            packageName,
            NavInfoReceivingService::class.java.name,
            1
        )

        if (!navUpdatesRegistered) {
            toast("Could not register turn-by-turn feed")
        }
        return navUpdatesRegistered
    }

    private fun stopRoute() {
        routeRequestId++
        NavInfoReceivingService.guidanceActive = false
        navigator?.getSimulator()?.unsetUserLocation()
        navigator?.stopGuidance()
        navigator?.clearDestinations()

        if (navUpdatesRegistered) {
            navigator?.unregisterServiceForNavUpdates()
            navUpdatesRegistered = false
        }

        BleGlassesManager.sendCommand(ManeuverMapper.CMD_OFF)
        txtNav.text = "Navigation: stopped"
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    override fun onDestroy() {
        stopRoute()
        navigator?.removeArrivalListener(arrivalListener)
        navigator?.cleanup()
        navigator = null
        BleGlassesManager.statusListener = null
        BleGlassesManager.disconnect()
        super.onDestroy()
    }
}
