package expo.modules.tezprinter

import android.util.Log
import com.print.base.bean.DeviceItem
import com.print.base.listen.ConnectListener
import com.print.printer.Printer
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicReference

/**
 * ConnectionGuard tracks printer connection state and queues operations until ready.
 * Implements Section 3.1 of the Tez/Shakti Implementation Guide.
 *
 * NOTE: The SDK interface uses typos (`onConneted`, `onConnetFailed`).
 * These match the OEM Flashlabel library byte-for-byte.
 */
class ConnectionGuard : ConnectListener {
    enum class State {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        FAILED
    }

    private val stateRef = AtomicReference(State.DISCONNECTED)
    private val onReadyQueue = CopyOnWriteArrayList<Runnable>()
    private var stateChangeListener: ((State, String?) -> Unit)? = null

    val state: State
        get() = stateRef.get()

    val isReady: Boolean
        get() = stateRef.get() == State.CONNECTED

    fun setStateChangeListener(listener: ((State, String?) -> Unit)?) {
        this.stateChangeListener = listener
    }

    fun connect(printer: Printer, device: DeviceItem) {
        stateRef.set(State.CONNECTING)
        stateChangeListener?.invoke(State.CONNECTING, null)
        Log.i(TAG, "[ConnectionGuard] Connecting to ${device.name ?: "Unknown"} (${device.address}) modelKey=${device.modelKey}")
        printer.setListener(this)
        printer.connect(device)
    }

    override fun onConneted() {
        Log.i(TAG, "[ConnectionGuard] onConneted: Printer confirmed connected")
        stateRef.set(State.CONNECTED)
        stateChangeListener?.invoke(State.CONNECTED, null)
        drainReadyQueue()
    }

    override fun onConnetFailed(msg: String?) {
        val errorMsg = msg ?: "Connection failed"
        Log.w(TAG, "[ConnectionGuard] onConnetFailed: $errorMsg")
        stateRef.set(State.FAILED)
        stateChangeListener?.invoke(State.FAILED, errorMsg)
        clearReadyQueue()
    }

    override fun closed() {
        Log.i(TAG, "[ConnectionGuard] closed: Connection closed/dropped")
        stateRef.set(State.DISCONNECTED)
        stateChangeListener?.invoke(State.DISCONNECTED, null)
        clearReadyQueue()
    }

    fun runWhenReady(task: Runnable) {
        if (isReady) {
            task.run()
        } else {
            onReadyQueue.add(task)
        }
    }

    fun reset() {
        stateRef.set(State.DISCONNECTED)
        clearReadyQueue()
    }

    private fun drainReadyQueue() {
        val tasks = ArrayList(onReadyQueue)
        onReadyQueue.clear()
        for (task in tasks) {
            try {
                task.run()
            } catch (t: Throwable) {
                Log.e(TAG, "[ConnectionGuard] Error executing queued ready task", t)
            }
        }
    }

    private fun clearReadyQueue() {
        onReadyQueue.clear()
    }

    companion object {
        private const val TAG = "TezConnectionGuard"
    }
}
