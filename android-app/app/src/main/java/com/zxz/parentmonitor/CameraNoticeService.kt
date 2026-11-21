package com.zxz.parentmonitor

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder

// Visible foreground notification primitive. No camera capture is performed here.
class CameraNoticeService : Service() {
 override fun onCreate() {
  super.onCreate()
  val channel="zxz_camera_status"
  if(Build.VERSION.SDK_INT>=26) getSystemService(NotificationManager::class.java)
   .createNotificationChannel(NotificationChannel(channel,"Camera session",NotificationManager.IMPORTANCE_LOW))
  val notification=Notification.Builder(this,channel).setContentTitle("ZXZ Parent Monitor")
   .setContentText("Camera session active — tap app to manage or stop").setSmallIcon(android.R.drawable.ic_menu_camera).build()
  if(Build.VERSION.SDK_INT>=29) startForeground(7,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA) else startForeground(7,notification)
 }
 override fun onBind(intent:Intent?):IBinder?=null
}
