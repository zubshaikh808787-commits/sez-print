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
        val threshold: Int = 128     // 1..254
    )

    data class PrintResult(
        val success: Boolean,
        val copies: Int,
        val durationMs: Long,
        val widthMm: Int,
        val heightMm: Int
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

        Log.i(
            TAG,
            "[PrintPipeline] Bitmap decoded: ${bitmap.width}x${bitmap.height}px | " +
            "target=${options.widthMm}x${options.heightMm}mm | " +
            "copies=${options.copies} | paperType=${options.paperType} | " +
            "density=${options.density} | speed=${options.speed}"
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
        helper.setImgData(options.threshold, ImgData(imageName, bitmap))

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
                            heightMm = options.heightMm
                        )
                    )
                } else {
                    future.completeExceptionally(
                        PrinterCommandException(imageName, status, result?.msg ?: "Print failed with status $status")
                    )
                }
            }
        })

        build.cls()
        build.enable()
        build.CreatePage(options.widthMm, options.heightMm)
        build.paperType(options.paperType)
        build.density(options.density.coerceIn(0, 15))
        build.speed(options.speed.coerceIn(1.0f, 8.0f))
        build.printImg(imageName, options.copies.coerceAtLeast(1))
        build.disenable()

        Log.i(TAG, "[PrintPipeline] Submitting PrintBuild to helper.run()")
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
                        heightMm = options.heightMm
                    )
                )
            }
        }
    }

    companion object {
        private const val TAG = "TezPrintPipeline"
    }
}
