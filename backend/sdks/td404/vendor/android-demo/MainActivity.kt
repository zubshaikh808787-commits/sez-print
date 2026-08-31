package com.ninestar.ninestarprinterdemo

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.ninestar.printer.bean.DeviceType
import com.ninestar.printer.bean.PrinterDevices
import com.ninestar.printer.interf.PortCallbackListener
import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * @作者: 三三同学
 * @时间: 2024/9/24
 * @描述:
 */
class MainActivity : ComponentActivity(), View.OnClickListener, PortCallbackListener {

    private val launcher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result: ActivityResult ->
            if (result.resultCode == RESULT_OK) {
                val macAddress = result.data!!.getStringExtra(BlueListActivity.EXTRA_DEVICE_ADDRESS)
                val blueName = result.data!!.getStringExtra(BlueListActivity.EXTRA_BLUE_NAME)
                tvState.text = "连接中..."
                val blueTooth: PrinterDevices = PrinterDevices.Build()
                    .setDeviceType(DeviceType.BLUETOOTH)
                    .setBlueName(blueName)
                    .setMacAddress(macAddress)
                    .build()
                printerManager.connectPrinter(blueTooth)
            }
        }

    companion object {
        val TAG: String = MainActivity::class.java.getSimpleName()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        initData()
    }

    private lateinit var tvState: TextView
    private lateinit var blueToothDevices: Button
    private lateinit var wifiDevices: Button
    private lateinit var disconnect: Button
    private lateinit var printBitmap: Button
    private lateinit var printPrn: Button
    private lateinit var printerManager: PrinterManager

    private fun initData() {
        setTitle("NinestarPrinterDemo V1.0.0")
        tvState = findViewById(R.id.tvState)
        blueToothDevices = findViewById(R.id.blueToothDevices)
        blueToothDevices.setOnClickListener(this)
        wifiDevices = findViewById(R.id.wifiDevices)
        wifiDevices.setOnClickListener(this)
        disconnect = findViewById(R.id.disconnect)
        disconnect.setOnClickListener(this)
        printBitmap = findViewById(R.id.printBitmap)
        printBitmap.setOnClickListener(this)
        printPrn = findViewById(R.id.printPrn)
        printPrn.setOnClickListener(this)
        printerManager = PrinterManager.getInstance()
        printerManager.setCallbackListener(this)
    }

    @SuppressLint("MissingInflatedId")
    override fun onClick(v: View) {
        when (v.id) {
            R.id.blueToothDevices -> {
                launcher.launch(Intent(this, BlueListActivity::class.java))
            }

            R.id.wifiDevices -> {
                val customView = layoutInflater.inflate(R.layout.custom_dialog, null);
                val ip = customView.findViewById<EditText>(R.id.edtIp)
                val builder = AlertDialog.Builder(this)
                builder.setView(customView)
                builder.setTitle("wifi 连接")
                builder.setPositiveButton("确定") { dialog, which ->
                    tvState.text = "连接中..."
                    val wifi: PrinterDevices = PrinterDevices.Build()
                        .setDeviceType(DeviceType.WIFI)
                        .setIp(ip.text.toString())
                        .setPort(9100)
                        .build()
                    printerManager.connectPrinter(wifi)
                }
                builder.setNegativeButton("取消", null)
                val dialog = builder.create()
                dialog.show()
            }

            R.id.disconnect -> {
                printerManager.closePort()
                tvState.text = "未连接"
            }

            R.id.printPrn -> {
                if (printerManager.connectStatus) {
                    try {
                        val byteArray = convertPrnToByteArray()
                        printerManager.sendDataToPrinter(byteArray, false)
                    } catch (e: Exception) {
                        Log.e(TAG, "onClick: R.id.printPrn >>>>>>>>>>>>>>>>>>>>>>>>>>>" + e.message)
                    }
                } else {
                    Toast.makeText(this, "请先连接设备", Toast.LENGTH_SHORT).show()
                }

            }

            R.id.printBitmap -> {
                if (printerManager.connectStatus){
                    try {
                        val byteArray = PrintContent.getLabel(this, 2)
                        printerManager.sendDataToPrinter(byteArray, false)
                    } catch (e: Exception) {
                        Log.e(TAG, "onClick: R.id.printBitmap >>>>>>>>>>>>>>>>>>>>>>>>>>>" + e.message)
                    }
                }else{
                    Toast.makeText(this, "请先连接设备", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun convertPrnToByteArray(): ByteArray? {
        // Since PdfRenderer cannot handle the compressed asset file directly, we copy it into
        // the cache directory.
        val inputStream: InputStream = assets.open("test.prn")
        val byteArrayOutputStream = ByteArrayOutputStream()
        var size: Int
        while (inputStream.read().also { size = it } != -1) {
            byteArrayOutputStream.write(size)
        }
        val toByteArray = byteArrayOutputStream.toByteArray()
        inputStream.close()
        byteArrayOutputStream.close()
        return toByteArray
    }

    override fun onSuccess(printerDevices: PrinterDevices?) {
        if (printerDevices != null) {
            if (printerDevices.deviceType == DeviceType.WIFI) {
                tvState.text =
                    " 连接成功 \n ip:${printerDevices.ip} \n port:${printerDevices.port} "
            } else {
                tvState.text =
                    " 连接成功 \n bluetoothName:${printerDevices.blueName} \n macAddress:${printerDevices.macAddress} "
            }
        }
    }

    override fun onFailure(ailure: String) {
        tvState.text = "未连接"
        Toast.makeText(this, ailure, Toast.LENGTH_SHORT).show()
    }

    override fun onDisconnect(printerDevices: PrinterDevices?) {
        if (printerDevices != null) {
            tvState.text = "未连接"
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        printerManager.closePort()
    }

}
