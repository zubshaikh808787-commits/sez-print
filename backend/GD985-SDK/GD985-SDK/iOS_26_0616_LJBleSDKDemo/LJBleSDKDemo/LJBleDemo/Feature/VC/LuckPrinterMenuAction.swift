//
//  LuckPrinterMenuAction.swift
//  LJBleDemo
//

import Foundation

enum LuckPrinterMenuAction: CaseIterable {
    case scan
    case disconnect
    case printRoll
    case printLabel
    case printCircleLabel
    case printBlackLabel
    case printTattoo
    case printSheetLabel
    case printFold
    case model
    case boot
    case sn
    case allInfo
    case firmware
    case shutTimeGet
    case status
    case battery
    case densityGet
    case densitySet
    case speedGet
    case speedSet
    case shutTimeSet
    case syncSettings
    case goPaper
    case reverseGoPaper
    case recovery
    case printerSetting

    var title: String {
        localizationKey.l10n
    }

    private var localizationKey: String {
        switch self {
        case .scan: return "action.scan"
        case .disconnect: return "action.disconnect"
        case .printRoll: return "action.print"
        case .printLabel: return "action.print_label"
        case .printCircleLabel: return "action.print_circle_label"
        case .printBlackLabel: return "action.print_black_label"
        case .printTattoo: return "action.print_tattoo"
        case .printSheetLabel: return "action.print_sheet_label"
        case .printFold: return "action.print_fold"
        case .model: return "action.model"
        case .boot: return "action.boot"
        case .sn: return "action.sn"
        case .allInfo: return "action.all_info"
        case .firmware: return "action.firmware"
        case .shutTimeGet: return "action.shut_time_get"
        case .status: return "action.status"
        case .battery: return "action.battery"
        case .densityGet: return "action.density_get"
        case .densitySet: return "action.density_set"
        case .speedGet: return "action.speed_get"
        case .speedSet: return "action.speed_set"
        case .shutTimeSet: return "action.shut_time_set"
        case .syncSettings: return "action.sync"
        case .goPaper: return "action.go_paper"
        case .reverseGoPaper: return "action.reverse_go_paper"
        case .recovery: return "action.recovery"
        case .printerSetting: return "action.printer_setting"
        }
    }

    var requiresConnection: Bool {
        switch self {
        case .scan, .disconnect:
            return false
        default:
            return true
        }
    }

    var printMode: PrintImageProcessor.PaperMode? {
        switch self {
        case .printRoll: return .roll
        case .printLabel: return .label
        case .printCircleLabel: return .circleLabel
        case .printBlackLabel: return .blackLabel
        case .printTattoo: return .tattoo
        case .printSheetLabel: return .sheetLabel
        case .printFold: return .fold
        default: return nil
        }
    }
}
