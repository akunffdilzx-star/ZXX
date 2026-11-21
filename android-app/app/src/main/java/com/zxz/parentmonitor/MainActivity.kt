package com.zxz.parentmonitor

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {
 private val prefs by lazy { getSharedPreferences("zxz_device", MODE_PRIVATE) }
 private val client = OkHttpClient.Builder().callTimeout(60, TimeUnit.SECONDS).build()
 private lateinit var baseUrl: EditText
 private lateinit var pairing: EditText
 private lateinit var deviceName: EditText
 private lateinit var status: TextView
 private val picker = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> if (uris.isNotEmpty()) uploadUris(uris) }

 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  val layout = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(28,32,28,28); setBackgroundColor(0xFF070A10.toInt()) }
  fun field(hint:String, value:String="") = EditText(this).apply { this.hint=hint; setSingleLine(true); setText(value); setTextColor(-1); setHintTextColor(0xFF8293AA.toInt()) }
  val title=TextView(this).apply { text="ZXZ PARENT MONITOR"; textSize=23f; setTextColor(0xFF55B5FF.toInt()) }
  baseUrl=field("Backend URL, contoh https://domain.com",prefs.getString("base","")!!)
  deviceName=field("Nama perangkat",android.os.Build.MODEL)
  pairing=field("Pairing code 4 digit")
  status=TextView(this).apply { setTextColor(-1); text="Belum dipasangkan" }
  fun button(text:String, action:()->Unit)=Button(this).apply { this.text=text; setOnClickListener { action() } }
  layout.addView(title); layout.addView(baseUrl); layout.addView(deviceName); layout.addView(pairing)
  layout.addView(button("PAIR DEVICE") { pair() })
  layout.addView(button("PILIH FOTO / VIDEO UNTUK DIBAGIKAN") { picker.launch(arrayOf("image/*","video/*")) })
  layout.addView(button("SETUJUI REMOTE LIVE CAMERA") { explainConsent() })
  layout.addView(button("CABUT PERSETUJUAN KAMERA") { prefs.edit().putBoolean("camera_consent",false).apply(); status.text="Persetujuan kamera dicabut pada perangkat ini." })
  layout.addView(status); setContentView(ScrollView(this).apply { addView(layout) })
  refreshStatus()
 }
 private fun pair() { lifecycleScope.launch {
  try {
   val body=JSONObject().put("pairingCode",pairing.text.toString()).put("deviceName",deviceName.text.toString())
    .put("deviceModel",android.os.Build.MODEL).put("androidVersion",android.os.Build.VERSION.RELEASE)
   val result=post("/api/devices/pair",body,null)
   prefs.edit().putString("device_id",result.getString("deviceId")).putString("credential",result.getString("deviceCredential")).putString("base",baseUrl.text.toString().trimEnd('/')).apply()
   status.text="Terhubung. Device ID: ${result.getString("deviceId")}"
  } catch(e:Exception) { status.text="Pairing gagal: ${e.message}" }
 } }
 private fun explainConsent() {
  androidx.appcompat.app.AlertDialog.Builder(this).setTitle("Remote Live Camera")
   .setMessage("Jika diaktifkan, pemilik akun yang dipasangkan dapat meminta sesi kamera. Kamera hanya boleh berjalan saat Android mengizinkan, dengan indikator/notifikasi yang terlihat. Anda dapat menghentikan sesi atau mencabut persetujuan kapan saja. Setujui?")
   .setNegativeButton("BATAL",null).setPositiveButton("SAYA SETUJU") { _,_ ->
    prefs.edit().putBoolean("camera_consent",true).apply()
    status.text="Persetujuan fitur dicatat di perangkat ini. Izin kamera Android tetap diperlukan."
   }.show()
 }
 private fun refreshStatus() { if(prefs.getBoolean("camera_consent",false)) status.text="Remote camera consent: ON (device-local setting)" }
 private fun uploadUris(uris:List<Uri>) { lifecycleScope.launch {
  for(uri in uris) try { uploadOne(uri); status.text="Media berhasil dibagikan: ${uris.size} file" } catch(e:Exception) { status.text="Upload gagal: ${e.message}"; break }
 } }
 private suspend fun uploadOne(uri:Uri) = withContext(Dispatchers.IO) {
  val name=contentResolver.query(uri,null,null,null,null)?.use { c -> if(c.moveToFirst()) c.getString(c.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)) else "shared-media" } ?: "shared-media"
  val mime=contentResolver.getType(uri) ?: "application/octet-stream"
  require(mime.startsWith("image/")||mime.startsWith("video/")) { "Hanya foto/video" }
  val tmp=File(cacheDir,"upload_${System.currentTimeMillis()}"); contentResolver.openInputStream(uri)!!.use { input -> tmp.outputStream().use(input::copyTo) }
  val form=MultipartBody.Builder().setType(MultipartBody.FORM)
   .addFormDataPart("deviceId",prefs.getString("device_id","")!!)
   .addFormDataPart("deviceCredential",prefs.getString("credential","")!!)
   .addFormDataPart("media",name,tmp.asRequestBody(mime.toMediaTypeOrNull())).build()
  val request=Request.Builder().url(baseUrl.text.toString().trimEnd('/')+"/api/gallery/upload").post(form).build()
  client.newCall(request).execute().use { if(!it.isSuccessful) error(it.body?.string() ?: "HTTP ${it.code}") }
  tmp.delete()
 }
 private suspend fun post(path:String,json:JSONObject,token:String?):JSONObject = withContext(Dispatchers.IO) {
  val b=json.toString().toRequestBody("application/json".toMediaTypeOrNull())
  val req=Request.Builder().url(baseUrl.text.toString().trimEnd('/')+path).post(b).build()
  client.newCall(req).execute().use { val text=it.body?.string() ?: "{}"; if(!it.isSuccessful) error(text); JSONObject(text) }
 }
}
