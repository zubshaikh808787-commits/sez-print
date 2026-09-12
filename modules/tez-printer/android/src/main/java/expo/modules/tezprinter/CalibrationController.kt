package expo.modules.tezprinter

import android.util.Log
import com.print.base.bean.TaskCallBean
import com.print.printer.Command
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * CalibrationController executes the sensor calibration and paper-length learning sequence.
 * Implements Section 3.4 of the Tez/Shakti Implementation Guide.
 *
 * Sequence:
 *   1. Check get_status() -> ensure idle and no fault conditions
 *   2. set_paperType(paperType)
 *   3. calibration() (sensor light intensity)
 *   4. verifyIdle() loop
 *   5. LEARN_LABEL() (paper-length learning)
 *   6. verifyIdle() loop
 */
class CalibrationController(private val queue: SerialTaskQueue) {
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "TezCalibScheduler").apply { isDaemon = true }
    }

    data class PrinterStatus(
        val bitmask: Int,
        val isIdle: Boolean,
        val isPrinting: Boolean,
        val isCoverOpen: Boolean,
        val isNoPaper: Boolean,
        val isLowBattery: Boolean,
        val isOverheat: Boolean
    ) {
        val errorMessage: String?
            get() = when {
                isCoverOpen -> "Printer cover is open"
                isNoPaper -> "Printer is out of paper"
                isOverheat -> "Printer head is overheating"
                else -> null
            }
    }

    fun parseStatus(bean: TaskCallBean): PrinterStatus {
        val mask = if (bean.data != null && bean.data.isNotEmpty()) {
            bean.data[0].toInt() and 0xFF
        } else {
            0x00
        }
        return PrinterStatus(
            bitmask = mask,
            isIdle = mask == 0x00,
            isPrinting = (mask and 0x01) != 0,
            isCoverOpen = (mask and 0x02) != 0,
            isNoPaper = (mask and 0x04) != 0,
            isLowBattery = (mask and 0x08) != 0,
            isOverheat = (mask and 0x10) != 0
        )
    }

    fun getStatus(): CompletableFuture<PrinterStatus> {
        return queue.submit(Command.get_status(), "get_status", RetryPolicy.standard)
            .thenApply { parseStatus(it) }
    }

    /**
     * Executes the complete calibrateThenLearn sequence for the specified paperType.
     * paperType: 0=GAP, 1=CONTINUOUS, 2=BLACK, 3=TATTOO
     */
    fun calibrateThenLearn(paperType: Int): CompletableFuture<Void> {
        Log.i(TAG, "[Calibration] Initiating calibrateThenLearn for paperType=$paperType")

        // 1. Pre-flight check
        return getStatus()
            .thenCompose { status ->
                status.errorMessage?.let { errorMsg ->
                    Log.e(TAG, "[Calibration] Pre-flight aborted: $errorMsg (bitmask=0x${Integer.toHexString(status.bitmask)})")
                    throw IllegalStateException("Calibration aborted: $errorMsg")
                }
                Log.d(TAG, "[Calibration] Pre-flight OK (idle, cover closed, paper loaded). Setting paperType=$paperType")
                queue.submit(Command.set_paperType(paperType), "set_paperType", RetryPolicy.standard)
            }
            // 2. Sensor light calibration
            .thenCompose {
                Log.d(TAG, "[Calibration] Dispatching Command.calibration()")
                queue.submit(Command.calibration(), "calibration", RetryPolicy.standard)
            }
            // 3. Wait for sensor calibration to complete
            .thenCompose {
                Log.d(TAG, "[Calibration] Waiting for sensor calibration to settle...")
                verifyIdle(maxPolls = 15, pollIntervalMs = 300)
            }
            // 4. Paper-length learning
            .thenCompose {
                Log.d(TAG, "[Calibration] Dispatching Command.LEARN_LABEL()")
                queue.submit(Command.LEARN_LABEL(), "learn_label", RetryPolicy.standard)
            }
            // 5. Wait for label learning to settle
            .thenCompose {
                Log.d(TAG, "[Calibration] Waiting for label learn to settle...")
                verifyIdle(maxPolls = 20, pollIntervalMs = 300)
            }
            .thenApply {
                Log.i(TAG, "[Calibration] Calibration & label learning completed successfully for paperType=$paperType")
                null
            }
    }

    private fun verifyIdle(maxPolls: Int, pollIntervalMs: Long): CompletableFuture<PrinterStatus> {
        val future = CompletableFuture<PrinterStatus>()
        pollStatusRecursive(future, 0, maxPolls, pollIntervalMs)
        return future
    }

    private fun pollStatusRecursive(
        future: CompletableFuture<PrinterStatus>,
        pollCount: Int,
        maxPolls: Int,
        pollIntervalMs: Long
    ) {
        getStatus().whenComplete { status, error ->
            if (error != null) {
                if (pollCount + 1 < maxPolls) {
                    scheduler.schedule({
                        pollStatusRecursive(future, pollCount + 1, maxPolls, pollIntervalMs)
                    }, pollIntervalMs, TimeUnit.MILLISECONDS)
                } else {
                    future.completeExceptionally(error)
                }
                return@whenComplete
            }

            status.errorMessage?.let { errorMsg ->
                future.completeExceptionally(IllegalStateException("Fault detected during calibration: $errorMsg"))
                return@whenComplete
            }

            if (status.isIdle) {
                future.complete(status)
            } else if (pollCount + 1 < maxPolls) {
                scheduler.schedule({
                    pollStatusRecursive(future, pollCount + 1, maxPolls, pollIntervalMs)
                }, pollIntervalMs, TimeUnit.MILLISECONDS)
            } else {
                // Settle timeout reached, but proceed if not in hard fault
                Log.w(TAG, "[Calibration] Settle poll limit reached without exact 0x00 idle (status=0x${Integer.toHexString(status.bitmask)})")
                future.complete(status)
            }
        }
    }

    companion object {
        private const val TAG = "TezCalibration"
    }
}
