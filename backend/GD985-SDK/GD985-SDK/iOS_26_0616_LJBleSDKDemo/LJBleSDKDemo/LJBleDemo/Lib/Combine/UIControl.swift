//
//  UIControl.swift
//  LuckyToolKit
//
//  Created by junky on 2022/3/2.
//

import Foundation
import UIKit
import Combine


public extension Publishers {
    
    class UIControlSubscription<S: Subscriber, C: UIControl>: Subscription where S.Input == C, S.Failure == Never {
        
        private var subscriber: S?
        private var control: C
        private var events: C.Event
        
        init(subscriber: S?, control: C, events: C.Event) {
            self.subscriber = subscriber
            self.control = control
            self.events = events
            configControl()
        }
        
        deinit {
            print("UIControllSubscription -deinit")
        }
        
        func configControl() {
            self.control.addTarget(self, action: #selector(eventHandler), for: self.events)
        }
        
        @objc func eventHandler() {
            _ = self.subscriber?.receive(self.control)
        }
        
        public func request(_ demand: Subscribers.Demand) {
            
        }
        
        public func cancel() {
            
            subscriber = nil
        }
        
    }
    
    struct UIControlPublisher: Publisher {
        
        public typealias Output = UIControl
        public typealias Failure = Never
        
        private var control: Output
        private var events: Output.Event
        
        init(control: Output, events: UIControl.Event) {
            self.control = control
            self.events = events
        }
        
        
        public func receive<S>(subscriber: S) where S : Subscriber, Never == S.Failure, UIControl == S.Input {
            let subscription = UIControlSubscription(subscriber: subscriber, control: control, events: events)
            subscriber.receive(subscription: subscription)
        }
    }
    
    
}

public extension UIControl {
    
    func publisher(events: UIControl.Event) -> Publishers.UIControlPublisher {
        return Publishers.UIControlPublisher(control: self, events: events)
    }
}









