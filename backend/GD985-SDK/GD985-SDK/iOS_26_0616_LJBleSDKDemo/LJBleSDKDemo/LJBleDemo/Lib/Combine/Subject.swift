//
//  Subject.swift
//  LuckyToolKit
//
//  Created by junky on 2022/3/2.
//

import Foundation
import Combine



@propertyWrapper
public struct CurrentValueSubjectProperty<T> {
    
    public var wrappedValue: T {
        set {
            value = newValue
        }
        get {
            value
        }
    }
    
    public var projectedValue: CurrentValueSubject<T, Never>
    
    private var value: T {
        didSet {
            projectedValue.send(value)
        }
    }
    
    public init(wrappedValue: T) {
        self.value = wrappedValue
        self.projectedValue = CurrentValueSubject<T, Never>(wrappedValue)
    }
    
}



@propertyWrapper
public struct PassthroughSubjectProperty<T> {
    
    public var wrappedValue: T {
        set {
            value = newValue
        }
        get {
            value
        }
    }

    public var projectedValue: PassthroughSubject<T, Never>
    
    var value: T {
        didSet {
            projectedValue.send(value)
        }
    }
    
    
    public init(wrappedValue: T) {
        self.value = wrappedValue
        self.projectedValue = PassthroughSubject<T, Never>()
    }
}

