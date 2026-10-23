package com.example.navigationglasses

import android.app.Application
import com.google.android.libraries.navigation.NavigationApi

class NavigationGlassesApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.MAPS_API_KEY.isNotBlank() && BuildConfig.MAPS_API_KEY != "DEFAULT_API_KEY") {
            NavigationApi.setApiKey(BuildConfig.MAPS_API_KEY)
        }
        BleGlassesManager.init(this)
    }
}
