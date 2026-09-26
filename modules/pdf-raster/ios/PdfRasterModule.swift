import ExpoModulesCore
import PDFKit
import UIKit

internal class PdfRasterException: Exception {
  private let messageText: String
  init(_ messageText: String) {
    self.messageText = messageText
  }
  override var reason: String { messageText }
}

public class PdfRasterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfRaster")

    AsyncFunction("renderPdfPage") { (uriString: String, pageIndex: Int, dpi: Double) -> [String: Any] in
      let url = Self.resolveUrl(uriString)
      guard let doc = PDFDocument(url: url) else {
        throw PdfRasterException("Unable to open PDF at \(uriString)")
      }
      guard pageIndex >= 0, pageIndex < doc.pageCount, let page = doc.page(at: pageIndex) else {
        throw PdfRasterException("Page index \(pageIndex) out of range")
      }

      let pageRect = page.bounds(for: .mediaBox)
      let scale = (dpi > 0 ? dpi : 300) / 72.0
      let w = max(1, Int((pageRect.width * scale).rounded()))
      let h = max(1, Int((pageRect.height * scale).rounded()))
      let size = CGSize(width: w, height: h)

      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      format.opaque = true
      let renderer = UIGraphicsImageRenderer(size: size, format: format)
      let image = renderer.image { ctx in
        UIColor.white.setFill()
        ctx.fill(CGRect(origin: .zero, size: size))
        ctx.cgContext.interpolationQuality = .high
        ctx.cgContext.saveGState()
        ctx.cgContext.translateBy(x: 0, y: CGFloat(h))
        ctx.cgContext.scaleBy(x: scale, y: -scale)
        page.draw(with: .mediaBox, to: ctx.cgContext)
        ctx.cgContext.restoreGState()
      }

      let outUrl = FileManager.default.temporaryDirectory
        .appendingPathComponent("pdf_page_\(pageIndex)_\(Int(dpi))_\(Int(Date().timeIntervalSince1970 * 1000)).png")
      guard let data = image.pngData() else {
        throw PdfRasterException("PNG encode failed")
      }
      try data.write(to: outUrl)

      return [
        "uri": outUrl.absoluteString,
        "widthPx": w,
        "heightPx": h,
        "widthPt": Double(pageRect.width),
        "heightPt": Double(pageRect.height),
        "pageCount": doc.pageCount,
      ]
    }
  }

  private static func resolveUrl(_ uriString: String) -> URL {
    if uriString.hasPrefix("file://") || uriString.hasPrefix("http") {
      return URL(string: uriString) ?? URL(fileURLWithPath: uriString)
    }
    if uriString.hasPrefix("/") {
      return URL(fileURLWithPath: uriString)
    }
    return URL(string: uriString) ?? URL(fileURLWithPath: uriString)
  }
}
