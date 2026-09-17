//
//  Publisher.swift
//  LuckyToolKit
//
//  Created by junky on 2022/3/2.
//

import Foundation
import Combine


public extension Publisher {
    
    func sinkOnMainQueue(receiveCompletion: @escaping ((Subscribers.Completion<Self.Failure>) -> Void), receiveValue: @escaping ((Output) -> Void)) -> Cancellable {
        receive(on: DispatchQueue.main).sink(receiveCompletion: receiveCompletion, receiveValue: receiveValue)
    }
    
    func link(_ to: any Subject<Output, Failure>) -> AnyCancellable {
        sink(receiveCompletion: to.send(completion:), receiveValue: to.send(_:))
    }
    
    
    
}


public extension Publisher where Failure == Never {
    
    func sinkOnMain(receiveValue: @escaping ((Self.Output) -> Void)) -> AnyCancellable {
        receive(on: DispatchQueue.main).sink(receiveValue: receiveValue)
    }
    
    func link(_ to: any Subject<Self.Output, Self.Failure>) -> AnyCancellable {
        sink(receiveValue: to.send(_:))
    }
}




