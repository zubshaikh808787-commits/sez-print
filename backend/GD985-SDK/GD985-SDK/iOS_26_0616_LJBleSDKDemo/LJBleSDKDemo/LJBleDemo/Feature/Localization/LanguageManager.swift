//
//  LanguageManager.swift
//  LJBleDemo
//

import Foundation

extension Notification.Name {
    static let appLanguageDidChange = Notification.Name("AppLanguageDidChange")
}

enum AppLanguage: String, CaseIterable {
    case zhHans = "zh-Hans"
    case en = "en"

    var displayName: String {
        switch self {
        case .zhHans: return "language.zh".l10n
        case .en: return "language.en".l10n
        }
    }
}

enum LanguageManager {

    private static let storageKey = "LJBleDemo.AppLanguage"

    static var current: AppLanguage {
        get {
            if let raw = UserDefaults.standard.string(forKey: storageKey),
               let language = AppLanguage(rawValue: raw) {
                return language
            }
            let preferred = Locale.preferredLanguages.first ?? "en"
            return preferred.hasPrefix("zh") ? .zhHans : .en
        }
        set {
            guard current != newValue else { return }
            UserDefaults.standard.set(newValue.rawValue, forKey: storageKey)
            NotificationCenter.default.post(name: .appLanguageDidChange, object: nil)
        }
    }

    static var locale: Locale {
        Locale(identifier: current.rawValue)
    }

    static func localized(_ key: String) -> String {
        guard let path = Bundle.main.path(forResource: current.rawValue, ofType: "lproj"),
              let bundle = Bundle(path: path) else {
            return Bundle.main.localizedString(forKey: key, value: key, table: nil)
        }
        return bundle.localizedString(forKey: key, value: key, table: nil)
    }

    static func localized(_ key: String, _ args: CVarArg...) -> String {
        String(format: localized(key), locale: locale, arguments: args)
    }
}

extension String {
    var l10n: String {
        LanguageManager.localized(self)
    }

    func l10n(_ args: CVarArg...) -> String {
        LanguageManager.localized(self, args)
    }
}
