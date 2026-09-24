package expo.modules.pdfraster

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.Executors

class PdfRasterModule : Module() {
  private val ioExecutor = Executors.newCachedThreadPool()

  override fun definition() = ModuleDefinition {
    Name("PdfRaster")

    AsyncFunction("renderPdfPage") { uriString: String, pageIndex: Int, dpi: Double, promise: Promise ->
      ioExecutor.execute {
        var pfd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        var tempFile: File? = null
        try {
          val context = appContext.reactContext
            ?: throw IllegalStateException("No Android React Context available")
          val uri = Uri.parse(uriString)
          val file = if (uri.scheme == "content" || (uri.scheme == null && !uriString.startsWith("/"))) {
            val tmp = File.createTempFile("pdf_src_", ".pdf", context.cacheDir)
            tempFile = tmp
            context.contentResolver.openInputStream(uri)?.use { input ->
              tmp.outputStream().use { output -> input.copyTo(output) }
            } ?: throw IOException("Cannot open input stream for: $uriString")
            tmp
          } else {
            val path = if (uri.scheme == "file") uri.path ?: uriString else uriString
            File(path)
          }

          pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
          renderer = PdfRenderer(pfd)
          if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
            throw IllegalArgumentException("Page index $pageIndex out of range (0..${renderer.pageCount - 1})")
          }

          val page = renderer.openPage(pageIndex)
          try {
            val scale = (if (dpi > 0) dpi else 150.0) / 72.0
            val w = Math.max(1, Math.round(page.width * scale).toInt())
            val h = Math.max(1, Math.round(page.height * scale).toInt())
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

            val outFile = File(context.cacheDir, "pdf_page_${pageIndex}_${dpi.toInt()}_${System.currentTimeMillis()}.png")
            FileOutputStream(outFile).use { stream ->
              bitmap.compress(Bitmap.CompressFormat.PNG, 95, stream)
            }
            bitmap.recycle()

            promise.resolve(
              mapOf(
                "uri" to "file://${outFile.absolutePath}",
                "widthPx" to w,
                "heightPx" to h,
                "widthPt" to page.width.toDouble(),
                "heightPt" to page.height.toDouble(),
                "pageCount" to renderer.pageCount,
              )
            )
          } finally {
            page.close()
          }
        } catch (e: Exception) {
          promise.reject("PDF_RASTER_FAILED", e.message, e)
        } finally {
          try { renderer?.close() } catch (_: Exception) {}
          try { pfd?.close() } catch (_: Exception) {}
          try { tempFile?.delete() } catch (_: Exception) {}
        }
      }
    }
  }
}
