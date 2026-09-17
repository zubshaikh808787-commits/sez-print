//
//  LuckPrinterScanController.swift
//  LJBleDemo
//

import UIKit
import SnapKit
import Combine
import CoreBluetooth
import LuckBleSDK

private let ai50Prefix = "AI50_"

final class LuckPrinterScanController: UIViewController {

    private var deviceList: [CBPeripheral] = []
    private var cancellables = Set<AnyCancellable>()
    private var connectingIdentifier: UUID?
    private var didNavigateToDetail = false

    private let scanIndicator = UIActivityIndicatorView(style: .medium)
    private let hintLabel = UILabel()
    private let tableView = UITableView(frame: .zero, style: .plain)
    private let emptyLabel = UILabel()
    private let rescanButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.97, blue: 0.98, alpha: 1)
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: nil, style: .plain, target: self, action: #selector(onBack))
        setupUI()
        reloadLocalization()
        bindNotifications()
        bindLanguageChange()
        refreshEmptyState()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        didNavigateToDetail = false
        startScan()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        JKBleManager.sharedInstance().stopScanPrinters()
        scanIndicator.stopAnimating()
    }

    deinit {
        cancellables.forEach { $0.cancel() }
    }

    // MARK: - UI

    private func setupUI() {
        let headerCard = UIView()
        headerCard.backgroundColor = .white
        headerCard.layer.cornerRadius = 12
        headerCard.layer.shadowColor = UIColor.black.cgColor
        headerCard.layer.shadowOpacity = 0.06
        headerCard.layer.shadowOffset = CGSize(width: 0, height: 2)
        headerCard.layer.shadowRadius = 6
        view.addSubview(headerCard)

        rescanButton.addTarget(self, action: #selector(onRescan), for: .touchUpInside)
        rescanButton.setTitleColor(UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1), for: .normal)
        rescanButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)

        scanIndicator.hidesWhenStopped = true

        hintLabel.font = .systemFont(ofSize: 14)
        hintLabel.textColor = .secondaryLabel
        hintLabel.numberOfLines = 0

        let headerStack = UIStackView(arrangedSubviews: [hintLabel, scanIndicator])
        headerStack.axis = .horizontal
        headerStack.alignment = .center
        headerStack.spacing = 8

        headerCard.addSubview(headerStack)
        headerCard.addSubview(rescanButton)

        headerCard.snp.makeConstraints { make in
            make.top.equalTo(view.safeAreaLayoutGuide).offset(12)
            make.left.right.equalToSuperview().inset(16)
        }
        headerStack.snp.makeConstraints { make in
            make.top.left.bottom.equalToSuperview().inset(16)
            make.right.lessThanOrEqualTo(rescanButton.snp.left).offset(-8)
        }
        rescanButton.snp.makeConstraints { make in
            make.centerY.equalToSuperview()
            make.right.equalToSuperview().inset(16)
        }

        tableView.backgroundColor = .clear
        tableView.separatorInset = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
        tableView.rowHeight = 64
        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(LuckScanDeviceCell.self, forCellReuseIdentifier: LuckScanDeviceCell.reuseID)
        view.addSubview(tableView)

        emptyLabel.font = .systemFont(ofSize: 14)
        emptyLabel.textColor = .secondaryLabel
        emptyLabel.numberOfLines = 0
        emptyLabel.textAlignment = .center
        view.addSubview(emptyLabel)

        tableView.snp.makeConstraints { make in
            make.top.equalTo(headerCard.snp.bottom).offset(12)
            make.left.right.bottom.equalTo(view.safeAreaLayoutGuide)
        }
        emptyLabel.snp.makeConstraints { make in
            make.center.equalTo(tableView)
            make.left.right.equalToSuperview().inset(32)
        }

        reloadRescanButton()
    }

    private func reloadRescanButton() {
        rescanButton.setTitle("ble.scan.rescan".l10n, for: .normal)
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
        title = "ble.scan.title".l10n
        navigationItem.leftBarButtonItem?.title = "common.back".l10n
        hintLabel.text = "ble.scan.hint".l10n
        emptyLabel.text = "ble.scan.empty".l10n
        reloadRescanButton()
        tableView.reloadData()
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
                      !name.hasPrefix(ai50Prefix),
                      !self.deviceList.contains(where: { $0.identifier == peripheral.identifier })
                else { return }
                self.deviceList.append(peripheral)
                self.refreshEmptyState()
                self.tableView.reloadData()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .init("kBleDidConnectPeripheralNoticeName"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self, !self.didNavigateToDetail else { return }
                self.didNavigateToDetail = true
                MBProgressHUD.hidenHud()
                self.connectingIdentifier = nil
                self.tableView.reloadData()
                let detail = LuckPrinterController()
                self.navigationController?.pushViewController(detail, animated: true)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .init("kBleDidFailToConnectPeripheralNoticeName"))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                MBProgressHUD.hidenHud()
                self?.connectingIdentifier = nil
                self?.tableView.reloadData()
                MBProgressHUD.showErrorMessage("common.connect_failed".l10n)
            }
            .store(in: &cancellables)
    }

    // MARK: - Scan & Connect

    @objc private func onBack() {
        navigationController?.popViewController(animated: true)
    }

    @objc private func onRescan() {
        deviceList.removeAll()
        refreshEmptyState()
        tableView.reloadData()
        startScan()
    }

    private func startScan() {
        scanIndicator.startAnimating()
        JKBleManager.sharedInstance().scanPrinters()
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            self?.scanIndicator.stopAnimating()
        }
    }

    private func connectDevice(_ peripheral: CBPeripheral) {
        connectingIdentifier = peripheral.identifier
        tableView.reloadData()
        MBProgressHUD.showLoadingHUDMessage("common.connecting".l10n)
        JKBleManager.sharedInstance().connect(peripheral, timeout: 8)
    }

    private func refreshEmptyState() {
        emptyLabel.isHidden = !deviceList.isEmpty
        tableView.isHidden = deviceList.isEmpty
    }
}

// MARK: - TableView

extension LuckPrinterScanController: UITableViewDataSource, UITableViewDelegate {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        deviceList.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: LuckScanDeviceCell.reuseID, for: indexPath) as! LuckScanDeviceCell
        let peripheral = deviceList[indexPath.row]
        let isConnecting = connectingIdentifier == peripheral.identifier
        cell.configure(
            name: peripheral.name ?? "common.unknown_device".l10n,
            subtitle: isConnecting ? "common.connecting".l10n : "ble.device.tap_connect".l10n,
            connecting: isConnecting
        )
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard connectingIdentifier == nil else { return }
        connectDevice(deviceList[indexPath.row])
    }
}

// MARK: - Cell

private final class LuckScanDeviceCell: UITableViewCell {
    static let reuseID = "LuckScanDeviceCell"

    private let cardView = UIView()
    private let nameLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let indicator = UIActivityIndicatorView(style: .medium)

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        selectionStyle = .none
        backgroundColor = .clear
        contentView.backgroundColor = .clear

        cardView.backgroundColor = .white
        cardView.layer.cornerRadius = 10
        cardView.layer.borderWidth = 1
        cardView.layer.borderColor = UIColor.systemGray5.cgColor

        nameLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        nameLabel.textColor = .label
        nameLabel.numberOfLines = 2

        subtitleLabel.font = .systemFont(ofSize: 13)
        subtitleLabel.textColor = .secondaryLabel

        indicator.hidesWhenStopped = true

        contentView.addSubview(cardView)
        cardView.addSubview(nameLabel)
        cardView.addSubview(subtitleLabel)
        cardView.addSubview(indicator)

        cardView.snp.makeConstraints { make in
            make.edges.equalToSuperview().inset(UIEdgeInsets(top: 6, left: 16, bottom: 6, right: 16))
        }
        nameLabel.snp.makeConstraints { make in
            make.top.left.equalToSuperview().inset(14)
            make.right.lessThanOrEqualTo(indicator.snp.left).offset(-8)
        }
        subtitleLabel.snp.makeConstraints { make in
            make.top.equalTo(nameLabel.snp.bottom).offset(4)
            make.left.bottom.equalToSuperview().inset(14)
            make.right.lessThanOrEqualTo(indicator.snp.left).offset(-8)
        }
        indicator.snp.makeConstraints { make in
            make.centerY.equalToSuperview()
            make.right.equalToSuperview().inset(14)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(name: String, subtitle: String, connecting: Bool) {
        nameLabel.text = name
        subtitleLabel.text = subtitle
        if connecting {
            indicator.startAnimating()
            cardView.layer.borderColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1).cgColor
            subtitleLabel.textColor = UIColor(red: 0.12, green: 0.53, blue: 0.95, alpha: 1)
        } else {
            indicator.stopAnimating()
            cardView.layer.borderColor = UIColor.systemGray5.cgColor
            subtitleLabel.textColor = .secondaryLabel
        }
    }
}
