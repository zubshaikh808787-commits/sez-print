//
//  Future.swift
//  LuckyToolKit
//
//  Created by junky on 2022/3/5.
//

import Foundation
import Combine


extension Future {
    
    /// 直接执行
    /// - Returns: 内存管理
    public func fire() -> AnyCancellable {
        sink { _ in
            
        } receiveValue: { _ in
            
        }
    }
    
}

