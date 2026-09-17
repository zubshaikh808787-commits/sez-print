//
//  PrintImageProcessor.swift
//  LJBleDemo
//

import UIKit
import LuckBleSDK

enum PrintImageProcessor {

    enum PaperMode {
        case roll
        case label
        case circleLabel
        case blackLabel
        case tattoo
        case sheetLabel
        case fold
    }

    static func configure(_ printer: LuckPrinter, for mode: PaperMode) {
        switch mode {
        case .roll:
            printer.isLabel = false
            printer.paperType = .JZ
        case .label:
            printer.isLabel = true
            printer.paperType = .BQ
        case .circleLabel:
            printer.isLabel = true
            printer.paperType = .circleLabel
        case .blackLabel:
            printer.isLabel = true
            printer.paperType = .HBBQ
        case .tattoo:
            printer.isLabel = false
            printer.paperType = .WS
        case .sheetLabel:
            printer.isLabel = true
            printer.paperType = .BQ
            if printer.isMDModel {
                printer.mdWidth = 75
                printer.mdHeight = 130
                printer.mdM = 2
            }
        case .fold:
            printer.isLabel = false
            printer.paperType = .ZD
        }
    }

    /// 与 BleDetailVC.doPrinter 一致的图片处理流程
    static func processPrintImage(_ image: UIImage, printer: LuckPrinter, mode: PaperMode = .roll) -> UIImage? {
        configure(printer, for: mode)

        let paperSize = CGSize(width: 210, height: 297)
        let width = min(printer.supportMaxWidth, paperSize.width)

        var processed: UIImage?
        if printer.paperType == .JZ {
            processed = LuckTool.scallImage(image, toWidth: width * CGFloat(printer.dpi))
        } else {
            let rate = width / paperSize.width
            let height = paperSize.height * rate
            processed = LuckTool.scallImage(
                image,
                maxHeight: height * CGFloat(printer.dpi),
                maxWidth: width * CGFloat(printer.dpi)
            )
        }

        guard var result = processed else { return nil }

        if printer.imageStretchRatio != 1 {
            let newHeight = result.size.height * printer.imageStretchRatio
            result = stretchedImage(result, toHeight: newHeight) ?? result
        }

        if mode == .label || mode == .circleLabel || mode == .blackLabel || mode == .sheetLabel {
            return printer.ddPreviewImage(result)
        }
        return LJImageTool.ditherImage(result)
    }

    private static func stretchedImage(_ image: UIImage, toHeight newHeight: CGFloat) -> UIImage? {
        let targetSize = CGSize(width: image.size.width, height: newHeight)
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = true
        format.scale = 1.0
        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
        return renderer.image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: targetSize))
            let cgContext = context.cgContext
            cgContext.interpolationQuality = .high
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}
