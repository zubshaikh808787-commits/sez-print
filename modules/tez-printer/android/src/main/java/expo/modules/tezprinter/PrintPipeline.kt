package expo.modules.tezprinter

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.Log
import com.print.base.bean.ImgData
import com.print.base.bean.TaskCallBean
import com.print.base.listen.TaskCallback
import com.print.printer.PrintImgHelper
import com.print.printer.Printer
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * PrintPipeline executes bitmap rasterization and hardware submission via PrintImgHelper.
 * Implements Section 3.5 of the Tez/Shakti Implementation Guide.
 */
class PrintPipeline(
    private val printerProvider: () -> Printer?,
    private val queue: SerialTaskQueue
) {
    private val isPrinting = AtomicBoolean(false)

    data class Options(
        val pngBase64: String,
        val widthMm: Int,
        val heightMm: Int,
        val copies: Int = 1,
        val paperType: Int = 0,      // 0=GAP, 1=CONTINUOUS, 2=BLACK, 3=TATTOO
        val density: Int = 8,        // 0..15
        val speed: Float = 4.0f,     // 1.0..8.0
        val threshold: Int = 128,    // 1..254
        /** Gap/feed in mm. Continuous → printLinedots. Gap/black media: paperType + device LEARN_LABEL. */
        val gapMm: Float = 0f,
        val hOffsetMm: Float = 0f,
        val vOffsetMm: Float = 0f
    )

    data class PrintResult(
        val success: Boolean,
        val copies: Int,
        val durationMs: Long,
        val widthMm: Int,
        val heightMm: Int,
        /** true when the OEM's readCall() fired (a real device ACK); false when the
         *  15s safety timer completed the future instead — a write-complete guess,
         *  not a confirmed physical print. */
        val confirmedByDevice: Boolean
    )

    fun print(options: Options): CompletableFuture<PrintResult> {
        val future = CompletableFuture<PrintResult>()
        val startTime = System.currentTimeMillis()

        if (!isPrinting.compareAndSet(false, true)) {
            future.completeExceptionally(IllegalStateException("Print job already in progress"))
            return future
        }

        queue.submitRaw {
            try {
                executePrint(options, startTime, future)
            } catch (t: Throwable) {
                isPrinting.set(false)
                future.completeExceptionally(t)
            }
        }.exceptionally { err ->
            isPrinting.set(false)
            future.completeExceptionally(err)
            null
        }

        return future
    }

    private fun executePrint(
        options: Options,
        startTime: Long,
        future: CompletableFuture<PrintResult>
    ) {
        val printer = printerProvider()
        if (printer == null || !printer.isConnect) {
            isPrinting.set(false)
            future.completeExceptionally(IllegalStateException("Printer not connected"))
            return
        }

        // 1. Decode PNG Base64 to Bitmap
        val bitmap = try {
            val bytes = Base64.decode(options.pngBase64, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: throw IllegalArgumentException("Failed to decode bitmap from PNG data")
        } catch (e: Exception) {
            isPrinting.set(false)
            future.completeExceptionally(e)
            return
        }

        val pageBitmap = scaleToLabelDots(bitmap, options.widthMm, options.heightMm, options.hOffsetMm, options.vOffsetMm)
        Log.i(
            TAG,
            "[PrintPipeline] Bitmap decoded: ${bitmap.width}x${bitmap.height}px → " +
            "${pageBitmap.width}x${pageBitmap.height}px | " +
            "target=${options.widthMm}x${options.heightMm}mm | " +
            "hOffset=${options.hOffsetMm}mm, vOffset=${options.vOffsetMm}mm | " +
            "copies=${options.copies} | paperType=${options.paperType} | " +
            "density=${options.density} | speed=${options.speed} | gapMm=${options.gapMm}"
        )

        val helper = printer.helper
        if (helper == null) {
            isPrinting.set(false)
            future.completeExceptionally(IllegalStateException("PrintImgHelper not available on printer instance"))
            return
        }

        // Clean previous print state
        try {
            helper.stopPrint()
        } catch (_: Exception) {}

        val imageName = "tez_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}"

        // Pre-process threshold image
        helper.setImgData(options.threshold, ImgData(imageName, pageBitmap))

        // Build chained print command sequence
        val build = helper.build(object : TaskCallback() {
            override fun sendStatus(status: TaskCallBean?) {
                Log.d(TAG, "[PrintPipeline] sendStatus ACK for image '$imageName': ${status?.msg}")
            }

            override fun readCall(result: TaskCallBean?) {
                val status = result?.status ?: 0
                Log.i(TAG, "[PrintPipeline] readCall completion callback: status=$status, msg=${result?.msg}")
                isPrinting.set(false)
                if (status == 1 /* OK */ || status == 0 /* DEFAULT */) {
                    future.complete(
                        PrintResult(
                            success = true,
                            copies = options.copies,
                            durationMs = System.currentTimeMillis() - startTime,
                            widthMm = options.widthMm,
                            heightMm = options.heightMm,
                            confirmedByDevice = true
                        )
                    )
                } else {
                    future.completeExceptionally(
                        PrinterCommandException(imageName, status, result?.msg ?: "Print failed with status $status")
                    )
                }
            }
        })

        val isGap = options.paperType == 0 || options.paperType == 2 // 0=GAP, 2=BLACK
        val copies = options.copies.coerceAtLeast(1)

        build.cls()
        build.enable()
        build.CreatePage(options.widthMm, options.heightMm)
        build.paperType(options.paperType)
        build.density(options.density.coerceIn(0, 15))
        build.speed(options.speed.coerceIn(1.0f, 8.0f))
        for (i in 1..copies) {
            if (i == 1 && isGap) {
                build.backoffPaper()
            }
            build.printImg(imageName, 1)
            if (isGap) {
                build.fixedPoint()
                if (i == copies) {
                    build.forwardPaper()
                }
            } else {
                if (options.gapMm > 0f) {
                    val feedDots = (options.gapMm * OEM_DPM).toInt().coerceAtLeast(1)
                    build.printLinedots(feedDots)
                } else {
                    build.printLinedots(16) // 2mm feed at 8 dpm
                }
            }
        }
        build.disenable()

        Log.i(TAG, "[PrintPipeline] Submitting PrintBuild (isGap=$isGap, copies=$copies) to helper.run()")
        helper.run(build)

        // Safety fallback timer if OEM readCall doesn't fire
        CompletableFuture.delayedExecutor(15, TimeUnit.SECONDS).execute {
            if (isPrinting.compareAndSet(true, false)) {
                Log.w(TAG, "[PrintPipeline] Safety timer expired after 15s without readCall response")
                future.complete(
                    PrintResult(
                        success = true,
                        copies = options.copies,
                        durationMs = System.currentTimeMillis() - startTime,
                        widthMm = options.widthMm,
                        heightMm = options.heightMm,
                        confirmedByDevice = false
                    )
                )
            }
        }
    }

    /** Flashlabel OEM is 8 dots/mm (203 DPI). Match CreatePage millimetres 1:1. */
    private fun scaleToLabelDots(
        bitmap: Bitmap,
        widthMm: Int,
        heightMm: Int,
        hOffsetMm: Float = 0f,
        vOffsetMm: Float = 0f
    ): Bitmap {
        val w = (widthMm * OEM_DPM).coerceAtLeast(1)
        val h = (heightMm * OEM_DPM).coerceAtLeast(1)
        val scaled = if (bitmap.width == w && bitmap.height == h) {
            bitmap
        } else {
            Log.i(TAG, "[PrintPipeline] Fitting ${bitmap.width}x${bitmap.height} → ${w}x${h}px (${widthMm}x${heightMm}mm @ ${OEM_DPM} dpm)")
            containFitToPage(bitmap, w, h)
        }

        val hOffsetPx = (hOffsetMm * OEM_DPM).toInt()
        val vOffsetPx = (vOffsetMm * OEM_DPM).toInt()

        if (hOffsetPx == 0 && vOffsetPx == 0) {
            return scaled
        }

        Log.i(TAG, "[PrintPipeline] Applying physical offsets: hOffset=${hOffsetMm}mm (${hOffsetPx}px), vOffset=${vOffsetMm}mm (${vOffsetPx}px)")
        val target = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(target)
        canvas.drawColor(android.graphics.Color.WHITE)
        canvas.drawBitmap(scaled, hOffsetPx.toFloat(), vOffsetPx.toFloat(), null)
        return target
    }

    private fun containFitToPage(src: Bitmap, pageW: Int, pageH: Int): Bitmap {
        val page = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(page)
        canvas.drawColor(android.graphics.Color.WHITE)
        if (src.width <= 0 || src.height <= 0) return page
        val scale = minOf(pageW.toFloat() / src.width, pageH.toFloat() / src.height)
        val dw = src.width * scale
        val dh = src.height * scale
        val left = (pageW - dw) / 2f
        val top = (pageH - dh) / 2f
        val paint = android.graphics.Paint().apply {
            // Nearest-neighbor keeps thin text/barcode edges; bilinear bloomed thermal ink.
            isFilterBitmap = false
            isDither = false
            isAntiAlias = false
        }
        canvas.drawBitmap(src, null, android.graphics.RectF(left, top, left + dw, top + dh), paint)
        return page
    }

    companion object {
        private const val TAG = "TezPrintPipeline"
        private const val OEM_DPM = 8
    }
}
