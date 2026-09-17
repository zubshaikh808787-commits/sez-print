//
//  ViewController.swift
//  LJBleDemo
//

import UIKit
import Combine
import CoreBluetooth
import SnapKit
import LuckBleSDK

class ViewController: UIViewController {

    @IBOutlet weak var headerView: UIView!
    @IBOutlet weak var bottomStackView: UIStackView!
    @IBOutlet weak var searchButton: UIButton!
    @IBOutlet weak var connectedDeviceLabel: UILabel!
    @IBOutlet weak var disconnectButton: UIButton!

    var tableview: UITableView!

    var deviceList: [CBPeripheral] = []

    open var cancellables: Set<AnyCancellable> = []
    deinit {
        cancellables.forEach { $0.cancel() }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        initUI()
        reloadLocalization()
        bindVM()
    }

    @IBAction func onSearchAct(_ sender: Any) {
        PrinterManager.shared.searchDevices()
    }

    @IBAction func onDisconnectAct(_ sender: Any) {
        PrinterManager.shared.disconnectDevice()
    }

    func initUI() {
        tableview = UITableView(frame: .zero, style: .plain)
        tableview.delegate = self
        tableview.dataSource = self
        tableview.backgroundColor = .white
        tableview.separatorStyle = .none
        tableview.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
        view.insertSubview(tableview, at: 1)
        tableview.snp.makeConstraints { make in
            make.left.right.equalToSuperview()
            make.top.equalTo(headerView.snp.bottom)
            make.bottom.equalTo(bottomStackView.snp.top).offset(-8)
        }
    }

    private func reloadLocalization() {
        title = "nav.bluetooth".l10n
        searchButton?.setTitle("ble.search".l10n, for: .normal)
        connectedDeviceLabel?.text = "ble.connected_device".l10n
        disconnectButton?.setTitle("ble.disconnect".l10n, for: .normal)
    }

    func bindVM() {
        NotificationCenter.default.publisher(for: .appLanguageDidChange)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.reloadLocalization()
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .init("kBleDidPeripheralFoundNoticeName")).receive(on: DispatchQueue.main).sink { [weak self] notice in
            guard let weakself = self,
                  let obj = notice.object as? [String: Any],
                  let print = obj["peripheral"] as? CBPeripheral
            else { return }
            if weakself.deviceList.contains(where: { $0.identifier == print.identifier }) == false {
                weakself.deviceList.append(print)
                weakself.tableview.reloadData()
            }
        }.store(in: &cancellables)

        PrinterManager.shared.$printer.receive(on: DispatchQueue.main).sink { printer in
            guard printer != nil else { return }
            MBProgressHUD.hidenHud()
        }.store(in: &cancellables)
    }
}

extension ViewController: UITableViewDelegate, UITableViewDataSource {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        deviceList.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
        let dev = deviceList[indexPath.row]
        cell.textLabel?.text = dev.name
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        MBProgressHUD.showLoadingHUDMessage("common.connecting".l10n)
        let dev = deviceList[indexPath.row]
        JKBleManager.sharedInstance().connect(dev, timeout: 5)
    }
}
