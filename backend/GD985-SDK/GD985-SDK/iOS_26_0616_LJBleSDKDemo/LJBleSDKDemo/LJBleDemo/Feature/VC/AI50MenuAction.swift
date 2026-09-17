//
//  AI50MenuAction.swift
//  LJBleDemo
//

import Foundation

enum AI50MenuAction: CaseIterable {
    case scan
    case disconnect
    case printImage
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
    case shutTimeSet
    case wifiSend
    case wifiState
    case volumeGet
    case volumeSet
    case resetDevice
    case setLanguage

    var title: String {
        localizationKey.l10n
    }

    private var localizationKey: String {
        switch self {
        case .scan: return "action.scan"
        case .disconnect: return "action.disconnect"
        case .printImage: return "action.print"
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
        case .shutTimeSet: return "action.shut_time_set"
        case .wifiSend: return "action.wifi_send"
        case .wifiState: return "action.wifi_state"
        case .volumeGet: return "action.volume_get"
        case .volumeSet: return "action.volume_set"
        case .resetDevice: return "action.reset"
        case .setLanguage: return "action.set_language"
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

    var requiresAI50: Bool {
        switch self {
        case .wifiSend, .wifiState, .volumeGet, .volumeSet, .resetDevice, .setLanguage:
            return true
        default:
            return false
        }
    }
}
