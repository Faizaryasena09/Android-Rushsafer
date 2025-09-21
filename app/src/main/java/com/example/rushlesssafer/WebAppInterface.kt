package com.example.rushlesssafer

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import org.json.JSONObject

class WebAppInterface(private val mContext: Context) {

    @JavascriptInterface
    fun postMessage(json: String) {
        val jsonObject = JSONObject(json)
        val type = jsonObject.optString("type")

        if (type == "unlock" || type == "redirect") {
            // Set app as unlocked
            val sharedPref = mContext.getSharedPreferences("AppPrefs", Context.MODE_PRIVATE)
            with(sharedPref.edit()) {
                putBoolean("isUnlocked", true)
                apply()
            }

            val url = jsonObject.optString("url", null)

            // Create an intent to start MainActivity
            val intent = Intent(mContext, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                putExtra("url", url)
            }
            mContext.startActivity(intent)
        }
    }
}
