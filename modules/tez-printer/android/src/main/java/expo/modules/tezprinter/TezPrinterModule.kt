package expo.modules.tezprinter

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TezPrinterModule : Module() {
    private val manager: TezPrinterManager
        get() = TezPrinterManager.getInstance()

    override fun definition() = ModuleDefinition {
        Name("TezPrinter")

        Events(
            "onDeviceFound",
            "onScanFinished",
            "onScanFailed"
        )

        OnCreate {
            resolveApplication()?.let { manager.initialize(it) }
        }

        Function("isAvailable") {
            true
        }

        Function("getNativeRevision") {
            TezPrinterManager.NATIVE_REVISION
        }

        Function("isBluetoothEnabled") {
            manager.isBluetoothEnabled
        }

        Function("isConnected") {
            manager.isConnected
        }

        Function("getBondedDevices") {
            manager.getBondedDevices()
        }

        Function("startScan") {
            manager.startScan(
                onFound = { device ->
                    sendEvent("onDeviceFound", device)
                },
                onFinished = {
                    sendEvent("onScanFinished", emptyMap<String, Any>())
                },
                onFailed = { error ->
                    sendEvent("onScanFailed", mapOf("error" to error))
                }
            )
            true
        }

        Function("stopScan") {
            manager.stopScan()
            true
        }

        AsyncFunction("connect") { macAddress: String, deviceName: String?, promise: Promise ->
            resolveApplication()?.let { manager.initialize(it) }
            manager.connect(macAddress, deviceName).whenComplete { result, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_CONNECT", error.message ?: "Failed to connect", error)
                } else {
                    promise.resolve(result)
                }
            }
        }

        AsyncFunction("disconnect") { promise: Promise ->
            manager.disconnect().whenComplete { _, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_DISCONNECT", error.message ?: "Failed to disconnect", error)
                } else {
                    promise.resolve(true)
                }
            }
        }

        AsyncFunction("calibrate") { paperType: Int, promise: Promise ->
            manager.calibrationController.calibrateThenLearn(paperType).whenComplete { _, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_CALIBRATE", error.message ?: "Calibration failed", error)
                } else {
                    promise.resolve(
                        mapOf(
                            "success" to true,
                            "paperType" to paperType
                        )
                    )
                }
            }
        }

        AsyncFunction("getStatus") { promise: Promise ->
            manager.calibrationController.getStatus().whenComplete { status, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_STATUS", error.message ?: "Failed to get status", error)
                } else {
                    promise.resolve(
                        mapOf(
                            "bitmask" to status.bitmask,
                            "isIdle" to status.isIdle,
                            "isPrinting" to status.isPrinting,
                            "isCoverOpen" to status.isCoverOpen,
                            "isNoPaper" to status.isNoPaper,
                            "isLowBattery" to status.isLowBattery,
                            "isOverheat" to status.isOverheat,
                            "errorMessage" to status.errorMessage
                        )
                    )
                }
            }
        }

        AsyncFunction("getBatteryLevel") { promise: Promise ->
            manager.getBatteryLevel().whenComplete { battery, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_BATTERY", error.message ?: "Failed to get battery", error)
                } else {
                    promise.resolve(battery)
                }
            }
        }

        AsyncFunction("printImage") { options: Map<String, Any?>, promise: Promise ->
            val base64 = options["pngBase64"] as? String
                ?: return@AsyncFunction promise.reject("ERR_TEZ_INVALID_ARG", "pngBase64 is required", null)

            // Round, don't truncate — .toInt() on a Double truncates toward zero,
            // so every non-integer-mm label (50.8mm, 76.2mm, ...) was silently
            // told to the firmware and to scaleToLabelDots as up to ~1mm
            // narrower/shorter than it actually is on every axis.
            val widthMm = (options["widthMm"] as? Number)?.toDouble()?.let { Math.round(it).toInt() } ?: 50
            val heightMm = (options["heightMm"] as? Number)?.toDouble()?.let { Math.round(it).toInt() } ?: 30
            val copies = (options["copies"] as? Number)?.toInt() ?: 1
            val paperType = (options["paperType"] as? Number)?.toInt() ?: 0
            val density = (options["density"] as? Number)?.toInt() ?: 8
            val speed = (options["speed"] as? Number)?.toFloat() ?: 4.0f
            val threshold = (options["threshold"] as? Number)?.toInt() ?: 128
            val gapMm = (options["gapMm"] as? Number)?.toFloat() ?: 0f
            val hOffsetMm = (options["hOffsetMm"] as? Number)?.toFloat() ?: 0f
            val vOffsetMm = (options["vOffsetMm"] as? Number)?.toFloat() ?: 0f

            val printOptions = PrintPipeline.Options(
                pngBase64 = base64,
                widthMm = widthMm,
                heightMm = heightMm,
                copies = copies,
                paperType = paperType,
                density = density,
                speed = speed,
                threshold = threshold,
                gapMm = gapMm,
                hOffsetMm = hOffsetMm,
                vOffsetMm = vOffsetMm
            )

            manager.printPipeline.print(printOptions).whenComplete { result, error ->
                if (error != null) {
                    promise.reject("ERR_TEZ_PRINT", error.message ?: "Print failed", error)
                } else {
                    promise.resolve(
                        mapOf(
                            "success" to result.success,
                            "copies" to result.copies,
                            "durationMs" to result.durationMs,
                            "widthMm" to result.widthMm,
                            "heightMm" to result.heightMm,
                            "confirmedByDevice" to result.confirmedByDevice
                        )
                    )
                }
            }
        }

        AsyncFunction("printTestText") { text: String, promise: Promise ->
            try {
                val widthPx = 384
                val heightPx = 200
                val bitmap = android.graphics.Bitmap.createBitmap(widthPx, heightPx, android.graphics.Bitmap.Config.ARGB_8888)
                val canvas = android.graphics.Canvas(bitmap)
                canvas.drawColor(android.graphics.Color.WHITE)
                val paint = android.graphics.Paint().apply {
                    color = android.graphics.Color.BLACK
                    textSize = 30f
                    isFakeBoldText = true
                    isAntiAlias = true
                    textAlign = android.graphics.Paint.Align.CENTER
                }
                canvas.drawText("TEZ / SHAKTI PRINT", (widthPx / 2).toFloat(), 70f, paint)
                paint.textSize = 24f
                paint.isFakeBoldText = false
                canvas.drawText(text, (widthPx / 2).toFloat(), 130f, paint)
                val stream = java.io.ByteArrayOutputStream()
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, stream)
                val base64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                bitmap.recycle()

                val printOptions = PrintPipeline.Options(
                    pngBase64 = base64,
                    widthMm = 50,
                    heightMm = 30,
                    copies = 1,
                    paperType = 0,
                    density = 8,
                    speed = 4.0f
                )

                manager.printPipeline.print(printOptions).whenComplete { result, error ->
                    if (error != null) {
                        promise.reject("ERR_TEZ_PRINT", error.message ?: "Print failed", error)
                    } else {
                        promise.resolve(
                            mapOf(
                                "success" to result.success,
                                "copies" to result.copies,
                                "durationMs" to result.durationMs,
                                "widthMm" to result.widthMm,
                                "heightMm" to result.heightMm,
                                "confirmedByDevice" to result.confirmedByDevice
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                promise.reject("ERR_TEZ_TEST", e.message ?: "Test print failed", e)
            }
        }
    }

    private fun resolveApplication(): android.app.Application? {
        return (appContext.reactContext?.applicationContext as? android.app.Application)
            ?: appContext.currentActivity?.application
    }
}
