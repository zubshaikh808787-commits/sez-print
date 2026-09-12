package expo.modules.tezprinter

/**
 * Exponential backoff retry policy for Flashlabel OEM printer commands.
 * Matches Section 3.3 of the implementation guide.
 */
class RetryPolicy(
    val maxAttempts: Int = 3,
    val baseDelayMs: Long = 300L
) {
    fun backoffMillis(attempt: Int): Long {
        val shift = if (attempt >= 30) 30 else attempt
        return baseDelayMs * (1L shl shift)
    }

    companion object {
        val standard = RetryPolicy(maxAttempts = 3, baseDelayMs = 300L)
        val fast = RetryPolicy(maxAttempts = 2, baseDelayMs = 150L)
        val single = RetryPolicy(maxAttempts = 1, baseDelayMs = 0L)
    }
}
