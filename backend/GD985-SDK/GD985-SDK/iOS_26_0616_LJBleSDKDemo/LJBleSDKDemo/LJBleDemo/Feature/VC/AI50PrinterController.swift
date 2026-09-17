//
//  AI50PrinterController.swift
//  LJBleDemo
//

import UIKit
import SnapKit
import Combine
import CoreBluetooth
import LuckBleSDK
import PhotosUI
import UniformTypeIdentifiers

private let ai50Prefix = "AI50_"

final class AI50PrinterController: UIViewController {

    private var deviceList: [CBPeripheral] = []
    private var cancellables = Set<AnyCancellable>()
    private var isScanning = false

    private let discoveryIndicator = UIActivityIndicatorView(style: .medium)
    private let noDeviceLabel = UILabel()
    private let deviceCollectionView: UICollectionView
    private let messageTextView = UITextView()
    private let actionCollectionView: UICollectionView
    private let unpairButton = UIButton(type: .system)
    private let upgradeButton = UIButton(type: .system)

    private var deviceSectionTitleLabel: UILabel!
    private var infoSectionTitleLabel: UILabel!
    private var actionSectionTitleLabel: UILabel!

    private var pendingPrintCopies = 1

    private var wifiPrinter: LJWiFiPrinter? {
        JKBleManager.sharedInstance().printer as? LJWiFiPrinter
    }

    private var currentPrinter: LuckPrinter? {
        JKBleManager.sharedInstance().printer
    }

    init() {
        let deviceLayout = UICollectionViewFlowLayout()
        deviceLayout.minimumInteritemSpacing = 8
        deviceLayout.minimumLineSpacing = 8
        deviceCollectionView = UICollectionView(frame: .zero, collectionViewLayout: deviceLayout)

        let actionLayout = UICollectionViewFlowLayout()
        actionLayout.minimumInteritemSpacing = 8
        actionLayout.minimumLineSpacing = 8
        actionCollectionView = UICollectionView(frame: .zero, collectionViewLayout: actionLayout)

        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        let deviceLayout = UICollectionViewFlowLayout()
        deviceLayout.minimumInteritemSpacing = 8
        deviceLayout.minimumLineSpacing = 8
        deviceCollectionView = UICollectionView(frame: .zero, collectionViewLayout: deviceLayout)

        let actionLayout = UICollectionViewFlowLayout()
        actionLayout.minimumInteritemSpacing = 8
        actionLayout.minimumLineSpacing = 8
        actionCollectionView = UICollectionView(frame: .zero, collectionViewLayout: actionLayout)

        super.init(coder: coder)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.97, blue: 0.98, alpha: 1)
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: nil, style: .plain, target: self, action: #selector(onBack))
        setupUI()
        reloadLocalization()
        bindNotifications()
        bindLanguageChange()
        registerWifiStatusListener()
        startScan()
    }

    deinit {
        cancellables.forEach { $0.cancel() }
    }

    // MARK: - UI

    private func setupUI() {
        let scrollView = UIScrollView()
        scrollView.alwaysBounceVertical = true
        view.addSubview(scrollView)

        let contentStack = UIStackView()
        contentStack.axis = .vertical
        contentStack.spacing = 12
        scrollView.addSubview(contentStack)

        scrollView.snp.makeConstraints { make in
            make.top.left.right.equalTo(view.safeAreaLayoutGuide)
        }

        contentStack.snp.makeConstraints { make in
            make.edges.equalToSuperview().inset(16)
            make.width.equalTo(scrollView.snp.width).offset(-32)
        }

        let (deviceSection, deviceTitle) = makeSection(title: "", accessory: discoveryIndicator, content: makeDeviceSection())
        deviceSectionTitleLabel = deviceTitle
        let (infoSection, infoTitle) = makeSection(title: "", content: makeMessageSection())
        infoSectionTitleLabel = infoTitle
        let (actionSection, actionTitle) = makeSection(title: "", content: makeActionSection(), flex: true)
        actionSectionTitleLabel = actionTitle

        contentStack.addArrangedSubview(deviceSection)
        contentStack.addArrangedSubview(infoSection)
        contentStack.addArrangedSubview(actionSection)

        let bottomBar = UIStackView(arrangedSubviews: [unpairButton, upgradeButton])
        bottomBar.axis = .horizontal
        bottomBar.spacing = 12
        bottomBar.distribution = .fillEqually
        view.addSubview(bottomBar)

        bottomBar.snp.makeConstraints { make in
            make.top.equalTo(scrollView.snp.bottom).offset(8)
            make.left.right.equalToSuperview().inset(16)
            make.bottom.equalTo(view.safeAreaLayoutGuide).offset(-12)
            make.height.equalTo(48)
        }

        configure(button: unpairButton, title: "", filled: false)
        configure(button: upgradeButton, title: "", filled: true)
        unpairButton.addTarget(self, action: #selector(onUnpair), for: .touchUpInside)
        upgradeButton.addTarget(self, action: #selector(onUpgrade), for: .touchUpInside)

        discoveryIndicator.hidesWhenStopped = true

        deviceCollectionView.backgroundColor = .clear
        deviceCollectionView.dataSource = self
        deviceCollectionView.delegate = self
        deviceCollectionView.register(AI50DeviceCell.self, forCellWithReuseIdentifier: AI50DeviceCell.reuseID)

        actionCollectionView.backgroundColor = .clear
        actionCollectionView.dataSource = self
        actionCollectionView.delegate = self
        actionCollectionView.register(AI50ActionCell.self, forCellWithReuseIdentifier: AI50ActionCell.reuseID)

        noDeviceLabel.text = ""
        noDeviceLabel.numberOfLines = 0
        noDeviceLabel.textAlignment = .center
        noDeviceLabel.font = .systemFont(ofSize: 13)
        noDeviceLabel.textColor = .secondaryLabel
    }

    private func makeSection(title: String, accessory: UIView? = nil, content: UIView, flex: Bool = false) -> (UIView, UILabel) {
        let card = UIView()
        card.backgroundColor = .white
        card.layer.cornerRadius = 12
        card.layer.shadowColor = UIColor.black.cgColor
        card.layer.shadowOpacity = 0.06
        card.layer.shadowOffset = CGSize(width: 0, height: 2)
        card.layer.shadowRadius = 6

        let header = UIStackView()
        header.axis = .horizontal
        header.alignment = .center
        header.spacing = 8

        let accent = UIView()
        accent.backgroundColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1)
        accent.layer.cornerRadius = 2
        accent.snp.makeConstraints { make in make.width.equalTo(4); make.height.equalTo(16) }

        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = .boldSystemFont(ofSize: 15)

        header.addArrangedSubview(accent)
        header.addArrangedSubview(titleLabel)
        if let accessory {
            header.addArrangedSubview(UIView())
            header.addArrangedSubview(accessory)
        }

        card.addSubview(header)
        card.addSubview(content)

        header.snp.makeConstraints { make in
            make.top.left.right.equalToSuperview().inset(14)
        }
        content.snp.makeConstraints { make in
            make.top.equalTo(header.snp.bottom).offset(10)
            make.left.right.bottom.equalToSuperview().inset(14)
            if flex {
                make.height.greaterThanOrEqualTo(220)
            }
        }
        return (card, titleLabel)
    }

    private func makeDeviceSection() -> UIView {
        let container = UIView()
        container.addSubview(deviceCollectionView)
        container.addSubview(noDeviceLabel)

        deviceCollectionView.snp.makeConstraints { make in
            make.edges.equalToSuperview()
            make.height.equalTo(120)
        }
        noDeviceLabel.snp.makeConstraints { make in
            make.edges.equalToSuperview()
        }
        refreshEmptyDeviceView()
        return container
    }

    private func makeMessageSection() -> UIView {
        messageTextView.isEditable = false
        messageTextView.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        messageTextView.textColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1)
        messageTextView.backgroundColor = UIColor(white: 0.97, alpha: 1)
        messageTextView.layer.cornerRadius = 8
        messageTextView.text = ""
        messageTextView.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 8)
        messageTextView.snp.makeConstraints { make in
            make.height.equalTo(120)
        }
        return messageTextView
    }

    private func makeActionSection() -> UIView {
        actionCollectionView.snp.makeConstraints { make in
            make.height.equalTo(360)
        }
        return actionCollectionView
    }

    private func configure(button: UIButton, title: String, filled: Bool) {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .boldSystemFont(ofSize: 15)
        button.layer.cornerRadius = 10
        if filled {
            button.backgroundColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1)
            button.setTitleColor(.white, for: .normal)
        } else {
            button.backgroundColor = .white
            button.setTitleColor(UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1), for: .normal)
            button.layer.borderWidth = 1
            button.layer.borderColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1).cgColor
        }
    }

    // MARK: - Localization

    private func bindLanguageChange() {
        NotificationCenter.default.publisher(for: .appLanguageDidChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.reloadLocalization()
            }
            .store(in: &cancellables)
    }

    private func reloadLocalization() {
        title = "nav.ai50".l10n
        navigationItem.leftBarButtonItem?.title = "common.back".l10n
        deviceSectionTitleLabel?.text = "ai50.section.devices".l10n
        infoSectionTitleLabel?.text = "ai50.section.info".l10n
        actionSectionTitleLabel?.text = "ai50.section.actions".l10n
        noDeviceLabel.text = "ai50.no_device".l10n
        if messageTextView.text?.isEmpty != false {
            setMessage("ai50.select_device".l10n)
        }
        configure(button: unpairButton, title: "ai50.btn.unpair".l10n, filled: false)
        configure(button: upgradeButton, title: "ai50.btn.upgrade".l10n, filled: true)
        deviceCollectionView.reloadData()
        actionCollectionView.reloadData()
    }

    // MARK: - Bindings

    private func bindNotifications() {
        NotificationCenter.default.publisher(for: .init("kBleDidPeripheralFoundNoticeName"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notice in
                guard let self,
                      let obj = notice.object as? [String: Any],
                      let peripheral = obj["peripheral"] as? CBPeripheral,
                      let name = peripheral.name,
                      name.hasPrefix(ai50Prefix),
                      !self.deviceList.contains(where: { $0.identifier == peripheral.identifier })
                else { return }
                self.deviceList.append(peripheral)
                self.deviceCollectionView.reloadData()
                self.refreshEmptyDeviceView()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .init("kBleDidConnectPeripheralNoticeName"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.deviceCollectionView.reloadData()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .init("kBleDidDisconnectPeripheralNoticeName"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.setMessage("common.disconnected".l10n)
                self?.deviceCollectionView.reloadData()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .init("kBleDidFailToConnectPeripheralNoticeName"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.setMessage("common.connect_failed".l10n)
                MBProgressHUD.showErrorMessage("common.connect_failed".l10n)
            }
            .store(in: &cancellables)
    }

    private func registerWifiStatusListener() {
        LJWiFiConfig.sharedInstance().addWifiStatus { [weak self] status, _ in
            DispatchQueue.main.async {
                self?.setMessage(self?.formatWifiStatus(status) ?? "wifi.status.unknown".l10n)
            }
        }
    }

    // MARK: - Actions

    @objc private func onBack() {
        if let nav = navigationController, nav.viewControllers.first != self {
            nav.popViewController(animated: true)
        } else {
            dismiss(animated: true)
        }
    }

    @objc private func onUnpair() {
        onBack()
    }

    @objc private func onUpgrade() {
        guard ensureConnected() else { return }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.data, UTType.item], asCopy: true)
        picker.delegate = self
        present(picker, animated: true)
    }

    private func handleAction(_ action: AI50MenuAction) {
        setMessage("")
        if action.requiresConnection && currentPrinter == nil {
            toast("common.connect_first".l10n)
            return
        }
        if action.requiresAI50 && !ensureAI50() {
            return
        }

        switch action {
        case .scan: rescan()
        case .disconnect: disconnectDevice()
        case .printImage: showPrintDialog()
        case .model: queryModel()
        case .boot: queryBoot()
        case .sn: querySN()
        case .allInfo: queryAllInfo()
        case .firmware: queryFirmware()
        case .shutTimeGet: queryShutTime()
        case .status: queryStatus()
        case .battery: queryBattery()
        case .densityGet: queryDensity()
        case .densitySet: showSetDensityDialog()
        case .shutTimeSet: showSetShutTimeDialog()
        case .wifiSend: showWifiSetupDialog()
        case .wifiState: queryWifiState()
        case .volumeGet: queryVolume()
        case .volumeSet: showSetVolumeDialog()
        case .resetDevice: showResetConfirm()
        case .setLanguage: showSetLanguageDialog()
        }
    }

    // MARK: - Scan & Connect

    private func startScan() {
        isScanning = true
        discoveryIndicator.startAnimating()
        JKBleManager.sharedInstance().scanPrinters()
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            self?.isScanning = false
            self?.discoveryIndicator.stopAnimating()
        }
    }

    private func rescan() {
        if let connected = currentPrinter?.peripheral,
           connected.name?.hasPrefix(ai50Prefix) == true,
           !deviceList.contains(where: { $0.identifier == connected.identifier }) {
            deviceList.append(connected)
        } else {
            deviceList.removeAll { peripheral in
                guard let connected = currentPrinter?.peripheral else { return true }
                return peripheral.identifier != connected.identifier
            }
        }
        deviceCollectionView.reloadData()
        refreshEmptyDeviceView()
        startScan()
    }

    private func connectDevice(_ peripheral: CBPeripheral) {
        if let connected = currentPrinter?.peripheral, connected.identifier == peripheral.identifier {
            disconnectDevice()
            return
        }
        setMessage("common.connecting".l10n)
        MBProgressHUD.showLoadingHUDMessage("common.connecting".l10n)
        JKBleManager.sharedInstance().connect(peripheral, timeout: 8)
    }

    private func disconnectDevice() {
        guard let printer = currentPrinter, let peripheral = printer.peripheral else {
            toast("common.not_connected".l10n)
            return
        }
        JKBleManager.sharedInstance().disconnect(peripheral)
        setMessage("common.disconnected".l10n)
        deviceCollectionView.reloadData()
    }

    private func refreshEmptyDeviceView() {
        noDeviceLabel.isHidden = !deviceList.isEmpty
        deviceCollectionView.isHidden = deviceList.isEmpty
    }

    // MARK: - Print

    private func showPrintDialog() {
        guard ensureConnected() else { return }
        let alert = UIAlertController(title: "print.title".l10n, message: "print.message".l10n, preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "print.copies".l10n
            field.keyboardType = .numberPad
            field.text = "1"
        }
        alert.addAction(UIAlertAction(title: "print.select_image".l10n, style: .default) { [weak self, weak alert] _ in
            guard let self, let alert else { return }
            let text = alert.textFields?.first?.text ?? "1"
            self.pendingPrintCopies = max(1, Int(text) ?? 1)
            self.pickImage()
        })
        alert.addAction(UIAlertAction(title: "common.cancel".l10n, style: .cancel))
        present(alert, animated: true)
    }

    private func pickImage() {
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        present(picker, animated: true)
    }

    private func printImage(_ image: UIImage, copies: Int) {
        guard let printer = currentPrinter else { return }
        setMessage("print.processing".l10n)
        guard let processed = PrintImageProcessor.processPrintImage(image, printer: printer, mode: .roll) else {
            setMessage("print.process_failed".l10n)
            MBProgressHUD.showErrorMessage("print.process_failed".l10n)
            return
        }
        setMessage("print.start".l10n)
        printer.print([processed], copies: UInt(copies)) { [weak self] error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("print.failed_detail".l10n(error.localizedDescription))
                    MBProgressHUD.showErrorMessage("print.failed".l10n)
                } else {
                    self?.setMessage("print.success".l10n)
                    MBProgressHUD.showSuccessMessage("print.success".l10n)
                }
            }
        }
    }

    // MARK: - Query

    private func queryModel() {
        wifiPrinter?.getWifiPrinterModelComplete { [weak self] model, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.model.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.model".l10n(model ?? ""))
                }
            }
        }
    }

    private func queryBoot() {
        wifiPrinter?.getWifiPrinterModeComplete { [weak self] mode, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.boot.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.boot".l10n(mode))
                }
            }
        }
    }

    private func querySN() {
        wifiPrinter?.getWifiPrinterSNComplete { [weak self] sn, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.sn.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.sn".l10n(sn ?? ""))
                }
            }
        }
    }

    private func queryFirmware() {
        wifiPrinter?.getWifiPrinterVersionComplete { [weak self] version, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.firmware.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.firmware".l10n(version ?? ""))
                }
            }
        }
    }

    private func queryShutTime() {
        wifiPrinter?.getWifiPrinterCloseTime { [weak self] time, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.shut_time.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.shut_time".l10n(time))
                }
            }
        }
    }

    private func queryStatus() {
        wifiPrinter?.getWifiPrinterStatua { [weak self] status, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("status.query_failed".l10n(error.localizedDescription))
                } else {
                    self?.setMessage(self?.formatPrinterStatus(status) ?? "status.unknown".l10n)
                }
            }
        }
    }

    private func queryBattery() {
        wifiPrinter?.getWifiPrinterPower { [weak self] power, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.battery.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.battery".l10n(power))
                }
            }
        }
    }

    private func queryDensity() {
        wifiPrinter?.getWifiPrinterDensity { [weak self] density, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.density.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.density".l10n(density))
                }
            }
        }
    }

    private func queryAllInfo() {
        LJWiFiConfig.sharedInstance().getWifiPrinterDeviceInfoComplete { [weak self] info, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.all_info.fail".l10n(error.localizedDescription))
                    return
                }
                let text = "result.all_info".l10n(
                    info.version ?? "",
                    info.name ?? "",
                    info.mac ?? "",
                    info.sn ?? "",
                    info.model ?? "",
                    info.power,
                    info.closeTime,
                    info.ssid ?? "",
                    info.volume,
                    info.maxVolume
                )
                self?.setMessage(text)
            }
        }
    }

    private func queryWifiState() {
        LJWiFiConfig.sharedInstance().getWifiConnectStatusComplete { [weak self] status, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("wifi.query.failed".l10n(error.localizedDescription))
                } else {
                    self?.setMessage(self?.formatWifiQueryStatus(status) ?? "wifi.status.unknown".l10n)
                }
            }
        }
    }

    private func queryVolume() {
        LJWiFiConfig.sharedInstance().getWifiPrinterVolumeComplete { [weak self] max, current, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.volume.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.volume".l10n(current, max))
                }
            }
        }
    }

    // MARK: - Set Dialogs

    private func showSetDensityDialog() {
        guard let printer = currentPrinter else { return }
        let densityList = printer.densityList.compactMap { ($0 as? NSNumber)?.intValue ?? Int("\($0)") }
        guard !densityList.isEmpty else {
            toast("dialog.density.empty".l10n)
            return
        }
        wifiPrinter?.getWifiPrinterDensity { [weak self] current, _ in
            DispatchQueue.main.async {
                self?.presentPicker(title: "dialog.set_density".l10n, options: densityList.map { "\($0)" }, current: "\(current)") { value in
                    guard let density = Int(value) else { return }
                    self?.wifiPrinter?.setWifiPrinterDensity(density) { error in
                        DispatchQueue.main.async {
                            if let error {
                                self?.setMessage("result.density.set.fail".l10n(error.localizedDescription))
                            } else {
                                self?.setMessage("result.density.set.ok".l10n)
                            }
                        }
                    }
                }
            }
        }
    }

    private func showSetShutTimeDialog() {
        showNumberInput(title: "dialog.set_shut_time".l10n, placeholder: "common.minutes".l10n, maxLength: 3) { [weak self] value in
            LJWiFiConfig.sharedInstance().setWifiPrinterCloseTime(value) { error in
                DispatchQueue.main.async {
                    if let error {
                        self?.setMessage("result.shut_time.set.fail".l10n(error.localizedDescription))
                    } else {
                        self?.setMessage("result.shut_time.set.ok".l10n)
                    }
                }
            }
        }
    }

    private func showWifiSetupDialog() {
        let alert = UIAlertController(title: "wifi.setup.title".l10n, message: "wifi.setup.message".l10n, preferredStyle: .alert)
        alert.addTextField { $0.placeholder = "wifi.ssid".l10n }
        alert.addTextField { field in
            field.placeholder = "wifi.password".l10n
            field.isSecureTextEntry = true
        }
        alert.addAction(UIAlertAction(title: "common.ok".l10n, style: .default) { [weak self, weak alert] _ in
            guard let self, let alert else { return }
            let ssid = alert.textFields?[0].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let pwd = alert.textFields?[1].text ?? ""
            guard !ssid.isEmpty else { self.toast("wifi.ssid.empty".l10n); return }
            guard !pwd.isEmpty else { self.toast("wifi.password.empty".l10n); return }
            self.setMessage("wifi.configuring".l10n)
            LJWiFiConfig.sharedInstance().wifiConfigSSID(ssid, pwd: pwd) { status, error in
                DispatchQueue.main.async {
                    if let error {
                        self.setMessage("wifi.config_failed".l10n(error.localizedDescription))
                    } else {
                        self.setMessage(self.formatWifiStatus(status))
                    }
                }
            }
        })
        alert.addAction(UIAlertAction(title: "common.cancel".l10n, style: .cancel))
        present(alert, animated: true)
    }

    private func showSetVolumeDialog() {
        showNumberInput(title: "dialog.set_volume".l10n, placeholder: "dialog.volume.placeholder".l10n, maxLength: 3) { [weak self] value in
            LJWiFiConfig.sharedInstance().setWifiPrinterVolume(UInt(value)) { error in
                DispatchQueue.main.async {
                    if let error {
                        self?.setMessage("result.volume.set.fail".l10n(error.localizedDescription))
                    } else {
                        self?.setMessage("result.volume.set.ok".l10n)
                    }
                }
            }
        }
    }

    private func showSetLanguageDialog() {
        let alert = UIAlertController(title: "dialog.set_printer_language".l10n, message: "dialog.set_printer_language.message".l10n, preferredStyle: .alert)
        alert.addTextField { $0.placeholder = "dialog.language.placeholder".l10n }
        alert.addAction(UIAlertAction(title: "common.ok".l10n, style: .default) { [weak self, weak alert] _ in
            guard let self, let alert else { return }
            let language = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !language.isEmpty else { self.toast("dialog.language.empty".l10n); return }
            LJWiFiConfig.sharedInstance().setWifiPrinterLanguage(language) { error in
                DispatchQueue.main.async {
                    if let error {
                        self.setMessage("result.language.set.fail".l10n(error.localizedDescription))
                    } else {
                        self.setMessage("result.language.set.ok".l10n)
                    }
                }
            }
        })
        alert.addAction(UIAlertAction(title: "common.cancel".l10n, style: .cancel))
        present(alert, animated: true)
    }

    private func showResetConfirm() {
        let alert = UIAlertController(title: "dialog.reset.title".l10n, message: "dialog.reset.message".l10n, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "common.ok".l10n, style: .destructive) { [weak self] _ in
            LJWiFiConfig.sharedInstance().wifiResetDevice()
            self?.setMessage("result.reset.sent".l10n)
        })
        alert.addAction(UIAlertAction(title: "common.cancel".l10n, style: .cancel))
        present(alert, animated: true)
    }

    // MARK: - OTA

    private func startFirmwareUpdate(with url: URL) {
        guard let data = try? Data(contentsOf: url), let printer = currentPrinter else {
            toast("ota.read_failed".l10n)
            return
        }
        let ext = url.pathExtension.uppercased()
        guard ext == "BIN" || ext == "PRTU" else {
            toast("ota.invalid_file".l10n)
            return
        }
        setMessage("ota.start".l10n)
        printer.updateVersion(data, onProcess: { [weak self] progress in
            DispatchQueue.main.async {
                self?.setMessage("ota.progress".l10n(progress * 100))
            }
        }, callback: { [weak self] error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("ota.failed_detail".l10n(error.localizedDescription))
                    MBProgressHUD.showErrorMessage("ota.failed".l10n)
                } else {
                    self?.setMessage("ota.done".l10n)
                    MBProgressHUD.showSuccessMessage("ota.done".l10n)
                }
            }
        })
    }

    // MARK: - Helpers

    private func ensureConnected() -> Bool {
        if currentPrinter != nil { return true }
        toast("common.not_connected".l10n)
        return false
    }

    private func ensureAI50() -> Bool {
        guard ensureConnected() else { return false }
        if wifiPrinter != nil || currentPrinter?.printerType.rawValue == 8 {
            return true
        }
        toast("ai50.not_ai50".l10n)
        return false
    }

    private func setMessage(_ text: String) {
        messageTextView.text = text
    }

    private func toast(_ message: String) {
        MBProgressHUD.showInfoTitle(message)
    }

    private func showNumberInput(title: String, placeholder: String, maxLength: Int, submit: @escaping (Int) -> Void) {
        let alert = UIAlertController(title: title, message: nil, preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = placeholder
            field.keyboardType = .numberPad
        }
        alert.addAction(UIAlertAction(title: "common.ok".l10n, style: .default) { [weak alert] _ in
            let text = alert?.textFields?.first?.text ?? "0"
            submit(max(0, Int(text) ?? 0))
        })
        alert.addAction(UIAlertAction(title: "common.cancel".l10n, style: .cancel))
        present(alert, animated: true)
    }

    private func presentPicker(title: String, options: [String], current: String?, select: @escaping (String) -> Void) {
        let alert = UIAlertController(title: title, message: nil, preferredStyle: .actionSheet)
        for option in options {
            let action = UIAlertAction(title: option, style: .default) { _ in select(option) }
            if option == current {
                action.setValue(true, forKey: "checked")
            }
            alert.addAction(action)
        }
        alert.addAction(UIAlertAction(title: "common.cancel".l10n, style: .cancel))
        if let popover = alert.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        }
        present(alert, animated: true)
    }

    private func formatWifiStatus(_ status: LJWiFiStatus) -> String {
        switch status {
        case .connecting: return "wifi.status.connecting".l10n
        case .success: return "wifi.status.success".l10n
        case .pwdError: return "wifi.status.pwd_error".l10n
        case .disconnect: return "wifi.status.disconnect".l10n
        case .none: return "wifi.status.unknown".l10n
        @unknown default: return "wifi.status.code".l10n(status.rawValue)
        }
    }

    private func formatWifiQueryStatus(_ status: LJWiFiQueryStatus) -> String {
        switch status {
        case .none: return "wifi.query.none".l10n
        case .connecting: return "wifi.query.connecting".l10n
        case .connected: return "wifi.query.connected".l10n
        @unknown default: return "wifi.status.code".l10n(status.rawValue)
        }
    }

    private func formatPrinterStatus(_ status: LPPrinterState) -> String {
        if status.contains(.printing) { return "status.printing".l10n }
        if status.contains(.openCover) { return "status.open_cover".l10n }
        if status.contains(.outPaper) { return "status.out_paper".l10n }
        if status.contains(.power) { return "status.low_power".l10n }
        if status.contains(.hot) { return "status.overheat".l10n }
        if status.contains(.none) { return "status.normal".l10n }
        return "status.code".l10n(status.rawValue)
    }

    private func isConnected(_ peripheral: CBPeripheral) -> Bool {
        currentPrinter?.peripheral?.identifier == peripheral.identifier
    }
}

// MARK: - CollectionView

extension AI50PrinterController: UICollectionViewDataSource, UICollectionViewDelegateFlowLayout {
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        collectionView === deviceCollectionView ? deviceList.count : AI50MenuAction.allCases.count
    }

    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        if collectionView === deviceCollectionView {
            let cell = collectionView.dequeueReusableCell(withReuseIdentifier: AI50DeviceCell.reuseID, for: indexPath) as! AI50DeviceCell
            let peripheral = deviceList[indexPath.item]
            cell.configure(name: peripheral.name ?? "common.unknown_device".l10n, connected: isConnected(peripheral))
            return cell
        }
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: AI50ActionCell.reuseID, for: indexPath) as! AI50ActionCell
        cell.configure(title: AI50MenuAction.allCases[indexPath.item].title)
        return cell
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        if collectionView === deviceCollectionView {
            connectDevice(deviceList[indexPath.item])
        } else {
            handleAction(AI50MenuAction.allCases[indexPath.item])
        }
    }

    func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        let width = (collectionView.bounds.width - 8) / 2
        let height: CGFloat = collectionView === deviceCollectionView ? 52 : 44
        return CGSize(width: max(width, 120), height: height)
    }
}

// MARK: - Pickers

extension AI50PrinterController: PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let item = results.first?.itemProvider, item.canLoadObject(ofClass: UIImage.self) else { return }
        item.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            guard let self, let image = object as? UIImage else { return }
            DispatchQueue.main.async {
                self.printImage(image, copies: self.pendingPrintCopies)
            }
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        startFirmwareUpdate(with: url)
    }
}

// MARK: - Cells

private final class AI50DeviceCell: UICollectionViewCell {
    static let reuseID = "AI50DeviceCell"
    private let titleLabel = UILabel()
    private let statusLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        contentView.backgroundColor = UIColor(white: 0.97, alpha: 1)
        contentView.layer.cornerRadius = 8
        contentView.layer.borderWidth = 1
        contentView.layer.borderColor = UIColor.systemGray5.cgColor

        titleLabel.font = .systemFont(ofSize: 13, weight: .medium)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 2

        statusLabel.font = .systemFont(ofSize: 11)
        statusLabel.textAlignment = .center

        contentView.addSubview(titleLabel)
        contentView.addSubview(statusLabel)
        titleLabel.snp.makeConstraints { make in
            make.top.left.right.equalToSuperview().inset(8)
        }
        statusLabel.snp.makeConstraints { make in
            make.top.equalTo(titleLabel.snp.bottom).offset(4)
            make.left.right.bottom.equalToSuperview().inset(8)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(name: String, connected: Bool) {
        titleLabel.text = name
        statusLabel.text = connected ? "ai50.device.connected".l10n : "ai50.device.tap_connect".l10n
        statusLabel.textColor = connected ? UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1) : .secondaryLabel
        contentView.layer.borderColor = connected
            ? UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1).cgColor
            : UIColor.systemGray5.cgColor
    }
}

private final class AI50ActionCell: UICollectionViewCell {
    static let reuseID = "AI50ActionCell"
    private let titleLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        contentView.backgroundColor = UIColor(red: 0.93, green: 0.96, blue: 1, alpha: 1)
        contentView.layer.cornerRadius = 8
        titleLabel.font = .systemFont(ofSize: 13)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 2
        titleLabel.textColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1)
        contentView.addSubview(titleLabel)
        titleLabel.snp.makeConstraints { make in
            make.edges.equalToSuperview().inset(6)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(title: String) {
        titleLabel.text = title
    }
}
