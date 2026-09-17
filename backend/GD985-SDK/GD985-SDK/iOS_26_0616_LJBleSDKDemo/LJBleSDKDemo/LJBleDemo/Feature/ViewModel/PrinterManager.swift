//
//  PrinterManager.swift
//  LJBleDemo
//
//  Created by apple on 2026/6/9.
//

import UIKit
import LuckBleSDK
import Combine
class PrinterManager {

    static let shared: PrinterManager = PrinterManager()
    
    @CurrentValueSubjectProperty
    var printer: LuckPrinter?
    
    open var cancellables: Set<AnyCancellable> = []
    deinit {
        cancellables.forEach{$0.cancel()}
    }
    
    func addPrinterMonitor() {
        // 连接上设备
        NotificationCenter.default.publisher(for: .init("kBleDidConnectPeripheralNoticeName")).receive(on: DispatchQueue.main).sink { [weak self] notice in
            guard let weakself = self
            else { return }
            // 连接上获取配置信息
            guard let printer = JKBleManager.sharedInstance().printer else { return }
            weakself.printer = printer
            
        }.store(in: &cancellables)
        
        // 能发送指令 kLuckPrinterCanSendTaskNoticeName
        NotificationCenter.default.publisher(for: .init("kLuckPrinterCanSendTaskNoticeName")).receive(on: DispatchQueue.main).sink { [weak self] notice in
            guard let weakself = self else { return }
            // 连接上获取配置信息
            guard let printer = JKBleManager.sharedInstance().printer else { return }
            weakself.printer = printer
        }.store(in: &cancellables)
        
        
        // 连接失败
        NotificationCenter.default.publisher(for: .init("kBleDidFailToConnectPeripheralNoticeName")).receive(on: DispatchQueue.main).sink { [weak self] notice in
            guard let weakself = self else { return }
            weakself.printer = nil
            MBProgressHUD.showErrorMessage("manager.connect_failed".l10n)
        }.store(in: &cancellables)
        
        // 断开连接
        NotificationCenter.default.publisher(for: Notification.Name("kBleDidDisconnectPeripheralNoticeName")).sink { [weak self] _ in
            guard let weakself = self else { return }
            weakself.printer = nil
            MBProgressHUD.showErrorMessage("manager.disconnected".l10n)
        }.store(in: &cancellables)

    }
    
    
    func searchDevices() {
        JKBleManager.sharedInstance().scanPrinters()
    }
    
    func disconnectDevice() {
        guard let printer = printer, let peripheral = printer.peripheral else { return  }
        JKBleManager.sharedInstance().disconnect(peripheral)
    }
    
}

extension PrinterManager {
    
    static func configLuckBleSDK() {
        // 设置秘钥  目前提供的是测试sdk。
        JKBleManager.sharedInstance().abroadAsKey = "xxxxxxxxxx"
        PrinterManager.shared.addPrinterMonitor()
    }
}
