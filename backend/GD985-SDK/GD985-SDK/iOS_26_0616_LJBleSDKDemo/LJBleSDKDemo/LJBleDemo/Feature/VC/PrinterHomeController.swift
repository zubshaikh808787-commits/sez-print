//
//  PrinterHomeController.swift
//  LJBleDemo
//

import UIKit
import SnapKit
import Combine

final class PrinterHomeController: UIViewController {

    private enum HomeStyle {
        static let background = UIColor(red: 0.96, green: 0.97, blue: 0.98, alpha: 1)
        static let primary = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1)
        static let textPrimary = UIColor.label
        static let textSecondary = UIColor.secondaryLabel
    }

    private var cancellables = Set<AnyCancellable>()

    private let languageButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let footerLabel = UILabel()
    private var bluetoothCard: HomeCardView!
    private var wifiCard: HomeCardView!

    override func viewDidLoad() {
        super.viewDidLoad()
        navigationController?.setNavigationBarHidden(true, animated: false)
        view.backgroundColor = HomeStyle.background
        setupUI()
        reloadTexts()
        bindLanguageChange()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        navigationController?.setNavigationBarHidden(true, animated: animated)
    }

    deinit {
        cancellables.forEach { $0.cancel() }
    }

    private func bindLanguageChange() {
        NotificationCenter.default.publisher(for: .appLanguageDidChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.reloadTexts()
            }
            .store(in: &cancellables)
    }

    private func setupUI() {
        languageButton.setTitleColor(HomeStyle.primary, for: .normal)
        languageButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)
        languageButton.addTarget(self, action: #selector(showLanguagePicker), for: .touchUpInside)
        view.addSubview(languageButton)

        languageButton.snp.makeConstraints { make in
            make.top.equalTo(view.safeAreaLayoutGuide).offset(8)
            make.right.equalToSuperview().inset(20)
        }

        let scrollView = UIScrollView()
        scrollView.alwaysBounceVertical = true
        view.addSubview(scrollView)

        let contentView = UIView()
        scrollView.addSubview(contentView)

        scrollView.snp.makeConstraints { make in
            make.top.equalTo(languageButton.snp.bottom).offset(4)
            make.left.right.bottom.equalTo(view.safeAreaLayoutGuide)
        }
        contentView.snp.makeConstraints { make in
            make.edges.equalToSuperview()
            make.width.equalTo(scrollView.snp.width)
        }

        titleLabel.font = .boldSystemFont(ofSize: 24)
        titleLabel.textColor = HomeStyle.textPrimary
        titleLabel.textAlignment = .center

        subtitleLabel.font = .systemFont(ofSize: 14)
        subtitleLabel.textColor = HomeStyle.textSecondary
        subtitleLabel.textAlignment = .center
        subtitleLabel.numberOfLines = 0

        bluetoothCard = HomeCardView(primaryColor: HomeStyle.primary)
        bluetoothCard.addTarget(self, action: #selector(openBluetoothDemo), for: .touchUpInside)

        wifiCard = HomeCardView(primaryColor: HomeStyle.primary)
        wifiCard.addTarget(self, action: #selector(openAI50Demo), for: .touchUpInside)

        footerLabel.font = .systemFont(ofSize: 12)
        footerLabel.textColor = HomeStyle.textSecondary
        footerLabel.textAlignment = .center

        contentView.addSubview(titleLabel)
        contentView.addSubview(subtitleLabel)
        contentView.addSubview(bluetoothCard)
        contentView.addSubview(wifiCard)
        contentView.addSubview(footerLabel)

        titleLabel.snp.makeConstraints { make in
            make.top.equalToSuperview().offset(24)
            make.left.right.equalToSuperview().inset(20)
        }
        subtitleLabel.snp.makeConstraints { make in
            make.top.equalTo(titleLabel.snp.bottom).offset(8)
            make.left.right.equalToSuperview().inset(20)
        }
        bluetoothCard.snp.makeConstraints { make in
            make.top.equalTo(subtitleLabel.snp.bottom).offset(36)
            make.left.right.equalToSuperview().inset(20)
        }
        wifiCard.snp.makeConstraints { make in
            make.top.equalTo(bluetoothCard.snp.bottom).offset(16)
            make.left.right.equalToSuperview().inset(20)
        }
        footerLabel.snp.makeConstraints { make in
            make.top.equalTo(wifiCard.snp.bottom).offset(24)
            make.left.right.equalToSuperview().inset(20)
            make.bottom.equalToSuperview().offset(-32)
        }
    }

    private func reloadTexts() {
        languageButton.setTitle("language.button".l10n, for: .normal)
        titleLabel.text = "home.title".l10n
        subtitleLabel.text = "home.subtitle".l10n
        footerLabel.text = "home.app_name".l10n
        bluetoothCard.configure(
            title: "home.bluetooth.title".l10n,
            desc: "home.bluetooth.desc".l10n,
            enter: "home.enter".l10n
        )
        wifiCard.configure(
            title: "home.wifi.title".l10n,
            desc: "home.wifi.desc".l10n,
            enter: "home.enter".l10n
        )
    }

    @objc private func showLanguagePicker() {
        let alert = UIAlertController(title: "language.title".l10n, message: nil, preferredStyle: .actionSheet)
        for language in AppLanguage.allCases {
            let title = language.displayName + (LanguageManager.current == language ? " ✓" : "")
            alert.addAction(UIAlertAction(title: title, style: .default) { _ in
                LanguageManager.current = language
            })
        }
        alert.addAction(UIAlertAction(title: "language.cancel".l10n, style: .cancel))
        if let popover = alert.popoverPresentationController {
            popover.sourceView = languageButton
            popover.sourceRect = languageButton.bounds
        }
        present(alert, animated: true)
    }

    @objc private func openBluetoothDemo() {
        let controller = LuckPrinterScanController()
        navigationController?.setNavigationBarHidden(false, animated: false)
        navigationController?.pushViewController(controller, animated: true)
    }

    @objc private func openAI50Demo() {
        let controller = AI50PrinterController()
        controller.title = "nav.ai50".l10n
        navigationController?.setNavigationBarHidden(false, animated: false)
        navigationController?.pushViewController(controller, animated: true)
    }
}

// MARK: - HomeCardView

private final class HomeCardView: UIControl {

    private let titleLabel = UILabel()
    private let descLabel = UILabel()
    private let enterLabel = UILabel()

    init(primaryColor: UIColor) {
        super.init(frame: .zero)
        backgroundColor = .white
        layer.cornerRadius = 12
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.06
        layer.shadowOffset = CGSize(width: 0, height: 2)
        layer.shadowRadius = 6

        titleLabel.font = .boldSystemFont(ofSize: 18)
        titleLabel.textColor = .label
        titleLabel.numberOfLines = 0

        descLabel.font = .systemFont(ofSize: 13)
        descLabel.textColor = .secondaryLabel
        descLabel.numberOfLines = 0

        enterLabel.font = .boldSystemFont(ofSize: 14)
        enterLabel.textColor = primaryColor

        addSubview(titleLabel)
        addSubview(descLabel)
        addSubview(enterLabel)

        titleLabel.snp.makeConstraints { make in
            make.top.left.right.equalToSuperview().inset(20)
        }
        descLabel.snp.makeConstraints { make in
            make.top.equalTo(titleLabel.snp.bottom).offset(8)
            make.left.right.equalToSuperview().inset(20)
        }
        enterLabel.snp.makeConstraints { make in
            make.top.equalTo(descLabel.snp.bottom).offset(14)
            make.left.equalToSuperview().inset(20)
            make.bottom.equalToSuperview().inset(20)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(title: String, desc: String, enter: String) {
        titleLabel.text = title
        descLabel.text = desc
        enterLabel.text = enter
    }
}
