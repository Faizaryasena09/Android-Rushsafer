package com.example.rushlesssafer

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.example.rushlesssafer.databinding.ActivityMainBinding
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var isCoursePinningActive = false
    private var currentUrl: String? = null

    private val handler = Handler(Looper.getMainLooper())
    private val lockTaskChecker = object : Runnable {
        override fun run() {
            checkAndEnforceLockTask()
            handler.postDelayed(this, 2000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Unlock button fallback
        binding.unlockButton.visibility = View.VISIBLE
        binding.unlockButton.setOnClickListener { exitPinning() }

        // Setup WebView
        setupWebView()

        // Handle deep link intent
        handleIntent(intent)

        // Start lock task checker
        handler.post(lockTaskChecker)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(lockTaskChecker)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let { handleIntent(it) }
    }

    private fun handleIntent(intent: Intent) {
        val data = intent.data
        Log.d("MainActivity", "handleIntent: $data")
        if (intent.action == Intent.ACTION_VIEW && data != null &&
            data.scheme == "rushless-safer" && data.host == "exam") {

            val urlToLoad = data.getQueryParameter("url")
            val cookiesToSet = data.getQueryParameter("cookies")

            if (urlToLoad != null) {
                binding.welcomeText.visibility = View.GONE
                binding.webview.visibility = View.VISIBLE
                if (cookiesToSet != null) setCookies(urlToLoad, cookiesToSet)
                binding.webview.loadUrl(urlToLoad)
                handler.postDelayed({ updatePinningState() }, 500)
            } else {
                showWelcome()
            }
        } else {
            showWelcome()
        }
    }

    private fun showWelcome() {
        binding.welcomeText.visibility = View.VISIBLE
        binding.webview.visibility = View.GONE
        currentUrl = null
        isCoursePinningActive = false
        stopLockTaskIfNeeded()
        updatePinningState()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        binding.webview.apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.userAgentString += " ExamBrowser/1.0"

            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            addJavascriptInterface(WebAppInterface(this@MainActivity), "Android")

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    currentUrl = url
                    Log.d("WebView", "Page finished: $url")
                    updatePinningState()
                }
            }
        }
    }

    private fun setCookies(urlString: String, cookieString: String) {
        val cm = CookieManager.getInstance()
        cm.setAcceptCookie(true)
        val domain = try { URL(urlString).host } catch (e: Exception) { null }
        domain?.let {
            cookieString.split(";").forEach { cookie ->
                cm.setCookie(it, cookie.trim())
            }
            cm.flush()
        }
    }

    private fun updatePinningState() {
        val exam = currentUrl?.let { isExamPage() } ?: false
        if (exam) {
            Log.d("Pinning", "Exam page → lock task ON, unlock hidden")
            isCoursePinningActive = true
            binding.unlockButton.visibility = View.GONE
            startLockTaskSafely()
        } else {
            Log.d("Pinning", "Not exam page → lock task OFF, unlock visible")
            isCoursePinningActive = false
            binding.unlockButton.visibility = View.VISIBLE
            stopLockTaskIfNeeded()
        }
    }

    private fun isExamPage(): Boolean {
        currentUrl?.let {
            val uri = Uri.parse(it)
            return uri.pathSegments.size >= 3 &&
                    uri.pathSegments[0] == "courses" &&
                    uri.pathSegments[2] == "do"
        }
        return false
    }

    private fun checkAndEnforceLockTask() {
        if (isCoursePinningActive && !isInLockTaskMode) startLockTaskSafely()
    }

    private fun startLockTaskSafely() {
        if (!isInLockTaskMode) {
            try {
                startLockTask()
                Log.d("LockTask", "Started")
            } catch (e: Exception) {
                Log.e("LockTask", "Failed start", e)
            }
        }
    }

    private fun stopLockTaskIfNeeded() {
        if (isInLockTaskMode) {
            try {
                stopLockTask()
                Log.d("LockTask", "Stopped")
            } catch (e: Exception) {
                Log.e("LockTask", "Failed stop", e)
            }
        }
    }

    fun exitPinning() {
        Log.d("Exit", "Manual unlock triggered")
        forceUnlock()
    }

    fun forceUnlock() {
        try {
            stopLockTask()
            Log.d("ForceUnlock", "✅ stopLockTask() executed")
        } catch (e: Exception) {
            Log.e("ForceUnlock", "❌ stopLockTask() failed", e)
        }
        isCoursePinningActive = false
        currentUrl = null
        binding.unlockButton.visibility = View.VISIBLE
        updatePinningState()
    }

    override fun onBackPressed() {
        if (!isCoursePinningActive) super.onBackPressed()
    }

    inner class WebAppInterface(private val activity: MainActivity) {

        @JavascriptInterface
        fun postMessage(message: String) {
            Log.d("JS_BRIDGE", "📩 Received: $message")
            try {
                val json = org.json.JSONObject(message)
                when (json.getString("type")) {
                    "unlock" -> {
                        Log.i("WebAppInterface", "Perintah UNLOCK diterima. Aplikasi akan ditutup dalam 500ms.")
                        // Beri jeda agar UI javascript sempat update (misal: hilangkan spinner)
                        android.os.Handler(Looper.getMainLooper()).postDelayed({
                            activity.forceUnlock()
                        }, 500)
                    }
                    "redirect" -> activity.runOnUiThread {
                        val url = json.getString("url")
                        Log.d("JS_BRIDGE", "↪️ Redirect to $url, forcing unlock first.")
                        activity.forceUnlock() // <--- INI PERBAIKANNYA
                        activity.binding.webview.loadUrl(url)
                    }
                    else -> Log.w("JS_BRIDGE", "⚠️ Unknown type: ${json.getString("type")}")
                }
            } catch (e: Exception) {
                Log.e("JS_BRIDGE", "❌ Parse error", e)
            }
        }

        @JavascriptInterface
        fun showUnlockButton() {
            Log.d("JS_BRIDGE", "🔓 showUnlockButton called")
            activity.runOnUiThread {
                activity.forceUnlock()
            }
        }
    }

    private val isInLockTaskMode: Boolean
        get() {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            return am.isInLockTaskMode
        }
}
