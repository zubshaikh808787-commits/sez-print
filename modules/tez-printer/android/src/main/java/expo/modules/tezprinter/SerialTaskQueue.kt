package expo.modules.tezprinter

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.print.base.bean.PrinterConstantPool
import com.print.base.bean.TaskCallBean
import com.print.base.listen.TaskCallback
import com.print.printer.Command
import com.print.printer.Printer
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class PrinterCommandException(
    val tag: String,
    val status: Int,
    message: String = "Printer command '$tag' failed with status $status"
) : Exception(message)

/**
 * SerialTaskQueue serializes all addTask() commands to the OEM PrintSDK,
 * preventing byte stream interleaving and implementing automatic retries with backoff.
 * Implements Section 3.2 of the Tez/Shakti Implementation Guide.
 */
class SerialTaskQueue(private val printerProvider: () -> Printer?) {
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "TezSerialTaskQueue").apply { isDaemon = true }
    }
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "TezTaskScheduler").apply { isDaemon = true }
    }

    fun submit(command: Command, tag: String, retry: RetryPolicy = RetryPolicy.standard): CompletableFuture<TaskCallBean> {
        val future = CompletableFuture<TaskCallBean>()
        executor.submit {
            dispatchWithRetry(command, tag, retry, future, 0)
        }
        return future
    }

    fun submitRaw(task: Runnable): CompletableFuture<Void> {
        val future = CompletableFuture<Void>()
        executor.submit {
            try {
                task.run()
                future.complete(null)
            } catch (t: Throwable) {
                future.completeExceptionally(t)
            }
        }
        return future
    }

    private fun dispatchWithRetry(
        command: Command,
        tag: String,
        retry: RetryPolicy,
        future: CompletableFuture<TaskCallBean>,
        attempt: Int
    ) {
        val printer = printerProvider()
        if (printer == null) {
            future.completeExceptionally(IllegalStateException("Printer handle is null"))
            return
        }

        if (!printer.isConnect) {
            future.completeExceptionally(IllegalStateException("Printer is not connected (tag=$tag)"))
            return
        }

        Log.d(TAG, "[SerialTaskQueue] Dispatching task '$tag' (attempt ${attempt + 1}/${retry.maxAttempts})")

        printer.addTask(command, tag, true, object : TaskCallback() {
            override fun sendStatus(status: TaskCallBean?) {
                Log.d(TAG, "[SerialTaskQueue] sendStatus ACK for '$tag': ${status?.msg}")
            }

            override fun readCall(result: TaskCallBean?) {
                if (result == null) {
                    handleFailure(command, tag, retry, future, attempt, -1, "Null TaskCallBean response")
                    return
                }

                Log.d(TAG, "[SerialTaskQueue] readCall for '$tag': status=${result.status}, msg=${result.msg}")

                if (result.status == PrinterConstantPool.Status.OK) {
                    future.complete(result)
                } else if (result.status == PrinterConstantPool.Status.FAIL ||
                           result.status == PrinterConstantPool.Status.TIMEOUT) {
                    handleFailure(command, tag, retry, future, attempt, result.status, result.msg ?: "Command returned status ${result.status}")
                } else {
                    // Status 0 (DEFAULT) or unexpected
                    future.complete(result)
                }
            }
        })
    }

    private fun handleFailure(
        command: Command,
        tag: String,
        retry: RetryPolicy,
        future: CompletableFuture<TaskCallBean>,
        attempt: Int,
        status: Int,
        message: String
    ) {
        if (attempt + 1 < retry.maxAttempts) {
            val delayMs = retry.backoffMillis(attempt)
            Log.w(TAG, "[SerialTaskQueue] Task '$tag' failed (status=$status). Retrying in ${delayMs}ms (attempt ${attempt + 2}/${retry.maxAttempts})")
            scheduler.schedule({
                executor.submit {
                    dispatchWithRetry(command, tag, retry, future, attempt + 1)
                }
            }, delayMs, TimeUnit.MILLISECONDS)
        } else {
            Log.e(TAG, "[SerialTaskQueue] Task '$tag' failed permanently after ${attempt + 1} attempts (status=$status): $message")
            future.completeExceptionally(PrinterCommandException(tag, status, message))
        }
    }

    fun shutdown() {
        executor.shutdownNow()
        scheduler.shutdownNow()
    }

    companion object {
        private const val TAG = "TezTaskQueue"
    }
}
