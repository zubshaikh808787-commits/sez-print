//
//  LuckPrinterController.swift
//  LJBleDemo
//

import UIKit
import SnapKit
import Combine
import LuckBleSDK
import PhotosUI
import UniformTypeIdentifiers

final class LuckPrinterController: UIViewController {

    private var cancellables = Set<AnyCancellable>()

    private let connectedDeviceLabel = UILabel()
    private let messageTextView = UITextView()
    private let actionCollectionView: UICollectionView
    private let unpairButton = UIButton(type: .system)
    private let upgradeButton = UIButton(type: .system)

    private var infoSectionTitleLabel: UILabel!
    private var actionSectionTitleLabel: UILabel!
    private var isLeavingDetail = false

    private var pendingPrintCopies = 1
    private var pendingPrintMode: PrintImageProcessor.PaperMode = .roll

    private var currentPrinter: LuckPrinter? {
        JKBleManager.sharedInstance().printer
    }

    init() {
        let actionLayout = UICollectionViewFlowLayout()
        actionLayout.minimumInteritemSpacing = 8
        actionLayout.minimumLineSpacing = 8
        actionCollectionView = UICollectionView(frame: .zero, collectionViewLayout: actionLayout)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
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
        refreshConnectedDeviceLabel()
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

        let (deviceSection, _) = makeSection(title: "", content: makeConnectedDeviceSection())
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
        unpairButton.addTarget(self, action: #selector(onSwitchDevice), for: .touchUpInside)
        upgradeButton.addTarget(self, action: #selector(onUpgrade), for: .touchUpInside)

        actionCollectionView.backgroundColor = .clear
        actionCollectionView.dataSource = self
        actionCollectionView.delegate = self
        actionCollectionView.register(LuckActionCell.self, forCellWithReuseIdentifier: LuckActionCell.reuseID)
    }

    private func makeConnectedDeviceSection() -> UIView {
        connectedDeviceLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        connectedDeviceLabel.textColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1)
        connectedDeviceLabel.numberOfLines = 2
        connectedDeviceLabel.snp.makeConstraints { make in
            make.height.greaterThanOrEqualTo(24)
        }
        return connectedDeviceLabel
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
        let rows = ceil(Double(LuckPrinterMenuAction.allCases.count) / 2.0)
        let height = max(360, rows * 52)
        actionCollectionView.snp.makeConstraints { make in
            make.height.equalTo(height)
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
        title = "ble.detail.title".l10n
        navigationItem.leftBarButtonItem?.title = "common.back".l10n
        infoSectionTitleLabel?.text = "ble.section.info".l10n
        actionSectionTitleLabel?.text = "ble.section.actions".l10n
        if messageTextView.text?.isEmpty != false {
            setMessage("ble.detail.ready".l10n)
        }
        configure(button: unpairButton, title: "ble.btn.switch_device".l10n, filled: false)
        configure(button: upgradeButton, title: "ble.btn.upgrade".l10n, filled: true)
        refreshConnectedDeviceLabel()
        actionCollectionView.reloadData()
    }

    private func refreshConnectedDeviceLabel() {
        let name = currentPrinter?.name ?? currentPrinter?.peripheral?.name ?? "common.unknown_device".l10n
        connectedDeviceLabel.text = "ble.connected_device".l10n + name
    }

    // MARK: - Bindings

    private func bindNotifications() {
        NotificationCenter.default.publisher(for: .init("kBleDidDisconnectPeripheralNoticeName"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self, !self.isLeavingDetail else { return }
                self.setMessage("common.disconnected".l10n)
                self.navigationController?.popViewController(animated: true)
            }
            .store(in: &cancellables)
    }

    // MARK: - Actions

    @objc private func onBack() {
        if let nav = navigationController, nav.viewControllers.first != self {
            nav.popViewController(animated: true)
        } else {
            dismiss(animated: true)
        }
    }

    @objc private func onSwitchDevice() {
        isLeavingDetail = true
        navigationController?.popViewController(animated: true)
    }

    @objc private func onUpgrade() {
        guard ensureConnected() else { return }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.data, UTType.item], asCopy: true)
        picker.delegate = self
        present(picker, animated: true)
    }

    private func handleAction(_ action: LuckPrinterMenuAction) {
        setMessage("")
        if action.requiresConnection && currentPrinter == nil {
            toast("common.connect_first".l10n)
            return
        }

        switch action {
        case .scan: openScanPage()
        case .disconnect: disconnectAndReturnToScan()
        case .printRoll, .printLabel, .printCircleLabel, .printBlackLabel, .printTattoo, .printSheetLabel, .printFold:
            if let mode = action.printMode {
                showPrintDialog(mode: mode)
            }
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
        case .speedGet: querySpeed()
        case .speedSet: showSetSpeedDialog()
        case .shutTimeSet: showSetShutTimeDialog()
        case .syncSettings: syncSettings()
        case .goPaper: showGoPaperDialog(reverse: false)
        case .reverseGoPaper: showGoPaperDialog(reverse: true)
        case .recovery: showRecoveryConfirm()
        case .printerSetting: queryPrinterSetting()
        }
    }

    // MARK: - Navigation

    private func openScanPage() {
        navigationController?.popViewController(animated: true)
    }

    private func disconnectAndReturnToScan() {
        isLeavingDetail = true
        if let printer = currentPrinter, let peripheral = printer.peripheral {
            JKBleManager.sharedInstance().disconnect(peripheral)
            setMessage("common.disconnected".l10n)
        } else {
            toast("common.not_connected".l10n)
        }
        openScanPage()
    }

    // MARK: - Print

    private func showPrintDialog(mode: PrintImageProcessor.PaperMode) {
        guard ensureConnected() else { return }
        pendingPrintMode = mode
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

    private func printImage(_ image: UIImage, copies: Int, mode: PrintImageProcessor.PaperMode) {
        guard let printer = currentPrinter else { return }
        setMessage("print.processing".l10n)
        guard let processed = PrintImageProcessor.processPrintImage(image, printer: printer, mode: mode) else {
            setMessage("print.process_failed".l10n)
            MBProgressHUD.showErrorMessage("print.process_failed".l10n)
            return
        }
        setMessage("print.start".l10n)
        let completion: (Error?) -> Void = { [weak self] error in
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
        let count = UInt(copies)
        switch mode {
        case .roll, .sheetLabel:
            printer.print([processed], copies: count, callback: completion)
        case .label, .circleLabel, .blackLabel:
            printer.printLabel([processed], copies: count, callback: completion)
        case .tattoo:
            printer.printTattooImages([processed], copies: count, callback: completion)
        case .fold:
            printer.printFold([processed], copies: count, callback: completion)
        }
    }

    // MARK: - Query

    private func queryModel() {
        guard let printer = currentPrinter else { return }
        printer.getInfo { [weak self] info, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.model.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.model".l10n(info.model ?? ""))
                }
            }
        }
    }

    private func queryBoot() {
        guard let printer = currentPrinter else { return }
        setMessage("result.boot.ble".l10n(printer.printerCategory))
    }

    private func querySN() {
        guard let printer = currentPrinter else { return }
        printer.getInfo { [weak self] info, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.sn.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.sn".l10n(info.sn ?? ""))
                }
            }
        }
    }

    private func queryFirmware() {
        guard let printer = currentPrinter else { return }
        printer.getInfo { [weak self] info, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.firmware.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.firmware".l10n(info.version ?? ""))
                }
            }
        }
    }

    private func queryShutTime() {
        guard let printer = currentPrinter else { return }
        printer.getInfo { [weak self] info, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.shut_time.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.shut_time".l10n(Int(info.closeTime)))
                }
            }
        }
    }

    private func queryStatus() {
        guard let printer = currentPrinter else { return }
        printer.getState { [weak self] state in
            DispatchQueue.main.async {
                self?.setMessage(self?.formatPrinterStatus(state) ?? "status.unknown".l10n)
            }
        }
    }

    private func queryBattery() {
        guard let printer = currentPrinter else { return }
        printer.getPowerCompelete { [weak self] power in
            DispatchQueue.main.async {
                self?.setMessage("result.battery".l10n(Int(power)))
            }
        }
    }

    private func queryDensity() {
        guard let printer = currentPrinter else { return }
        printer.getInfo { [weak self] info, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.density.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.density".l10n(Int(info.thick)))
                }
            }
        }
    }

    private func querySpeed() {
        guard let printer = currentPrinter else { return }
        printer.getInfo { [weak self] info, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.speed.fail".l10n(error.localizedDescription))
                } else {
                    self?.setMessage("result.speed".l10n(Int(info.speed)))
                }
            }
        }
    }

    private func queryAllInfo() {
        guard let printer = currentPrinter else { return }
        printer.getInfo { [weak self] info, error in
            DispatchQueue.main.async {
                if let error {
                    self?.setMessage("result.all_info.fail".l10n(error.localizedDescription))
                    return
                }
                let text = "result.all_info.ble".l10n(
                    info.version ?? "",
                    info.name ?? "",
                    info.mac ?? "",
                    info.sn ?? "",
                    info.model ?? "",
                    Int(info.power),
                    Int(info.closeTime),
                    Int(info.thick),
                    Int(info.speed),
                    Int(info.paperType.rawValue)
                )
                self?.setMessage(text)
            }
        }
    }

    private func queryPrinterSetting() {
        toast("ble.feature.unsupported".l10n)
    }

    // MARK: - Set Dialogs

    private func showSetDensityDialog() {
        guard let printer = currentPrinter else { return }
        let densityList = printer.densityList.compactMap { ($0 as? NSNumber)?.intValue ?? Int("\($0)") }
        guard !densityList.isEmpty else {
            toast("dialog.density.empty".l10n)
            return
        }
        presentPicker(title: "dialog.set_density".l10n, options: densityList.map { "\($0)" }, current: "\(printer.thick)") { [weak self] value in
            guard let self, let printer = self.currentPrinter, let density = Int(value) else { return }
            printer.thick = UInt(density)
            printer.synchronize {
                DispatchQueue.main.async {
                    self.setMessage("result.density.set.ok".l10n)
                }
            }
        }
    }

    private func showSetSpeedDialog() {
        guard let printer = currentPrinter else { return }
        let speedList = printer.speedList.compactMap { ($0 as? NSNumber)?.intValue ?? Int("\($0)") }
        if speedList.isEmpty {
            showNumberInput(title: "dialog.set_speed".l10n, placeholder: "dialog.speed.placeholder".l10n, maxLength: 2) { [weak self] value in
                self?.applySpeed(value)
            }
        } else {
            presentPicker(title: "dialog.set_speed".l10n, options: speedList.map { "\($0)" }, current: "\(printer.speed)") { [weak self] value in
                guard let speed = Int(value) else { return }
                self?.applySpeed(speed)
            }
        }
    }

    private func applySpeed(_ speed: Int) {
        guard let printer = currentPrinter else { return }
        printer.speed = UInt(speed)
        printer.synchronize { [weak self] in
            DispatchQueue.main.async {
                self?.setMessage("result.speed.set.ok".l10n)
            }
        }
    }

    private func showSetShutTimeDialog() {
        showNumberInput(title: "dialog.set_shut_time".l10n, placeholder: "common.minutes".l10n, maxLength: 3) { [weak self] value in
            guard let self, let printer = self.currentPrinter else { return }
            printer.closeTime = UInt(value)
            printer.synchronize {
                DispatchQueue.main.async {
                    self.setMessage("result.shut_time.set.ok".l10n)
                }
            }
        }
    }

    private func showGoPaperDialog(reverse: Bool) {
        showNumberInput(title: reverse ? "dialog.reverse_go_paper".l10n : "dialog.go_paper".l10n, placeholder: "dialog.go_paper.placeholder".l10n, maxLength: 3) { [weak self] value in
            guard let self, let printer = self.currentPrinter else { return }
            let mm = max(1, value)
            if reverse {
                let task = LPSendTask.printerOutPaperTaskCompelete { _ in
                    DispatchQueue.main.async {
                        self.setMessage("result.go_paper.ok".l10n(mm))
                    }
                }
                printer.sendTask(task)
            } else {
                printer.setPrinterWalkLong(UInt(mm))
                printer.synchronize {
                    DispatchQueue.main.async {
                        self.setMessage("result.go_paper.ok".l10n(mm))
                    }
                }
            }
        }
    }

    private func syncSettings() {
        guard let printer = currentPrinter else { return }
        setMessage("result.syncing".l10n)
        printer.synchronize { [weak self] in
            DispatchQueue.main.async {
                self?.setMessage("result.sync.ok".l10n)
            }
        }
    }

    private func showRecoveryConfirm() {
        let alert = UIAlertController(title: "dialog.reset.title".l10n, message: "dialog.reset.message".l10n, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "common.ok".l10n, style: .destructive) { [weak self] _ in
            guard let self, let printer = self.currentPrinter else { return }
            printer.thick = 1
            printer.closeTime = 30
            printer.speed = 1
            printer.synchronize {
                DispatchQueue.main.async {
                    self.setMessage("result.recovery.ok".l10n)
                }
            }
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

    private func formatPrinterStatus(_ status: LPPrinterState) -> String {
        if status.contains(.printing) { return "status.printing".l10n }
        if status.contains(.openCover) { return "status.open_cover".l10n }
        if status.contains(.outPaper) { return "status.out_paper".l10n }
        if status.contains(.power) { return "status.low_power".l10n }
        if status.contains(.hot) { return "status.overheat".l10n }
        if status.contains(.none) { return "status.normal".l10n }
        return "status.code".l10n(status.rawValue)
    }
}

// MARK: - CollectionView

extension LuckPrinterController: UICollectionViewDataSource, UICollectionViewDelegateFlowLayout {
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        LuckPrinterMenuAction.allCases.count
    }

    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: LuckActionCell.reuseID, for: indexPath) as! LuckActionCell
        cell.configure(title: LuckPrinterMenuAction.allCases[indexPath.item].title)
        return cell
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        handleAction(LuckPrinterMenuAction.allCases[indexPath.item])
    }

    func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        let width = (collectionView.bounds.width - 8) / 2
        return CGSize(width: max(width, 120), height: 44)
    }
}

// MARK: - Pickers

extension LuckPrinterController: PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let item = results.first?.itemProvider, item.canLoadObject(ofClass: UIImage.self) else { return }
        item.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            guard let self, let image = object as? UIImage else { return }
            DispatchQueue.main.async {
                self.printImage(image, copies: self.pendingPrintCopies, mode: self.pendingPrintMode)
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

private final class LuckActionCell: UICollectionViewCell {
    static let reuseID = "LuckActionCell"
    private let titleLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        contentView.backgroundColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 0.08)
        contentView.layer.cornerRadius = 8

        titleLabel.font = .systemFont(ofSize: 12, weight: .medium)
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
