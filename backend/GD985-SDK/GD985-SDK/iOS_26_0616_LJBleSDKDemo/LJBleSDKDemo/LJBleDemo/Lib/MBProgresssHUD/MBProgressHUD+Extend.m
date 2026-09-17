//
//  MBProgressHUD+Extend.m
//  YGCD
//
//  Created by 阿米拉 on 2019/8/13.
//  Copyright © 2019年 林志强. All rights reserved.
//
#import <UIKit/UIKit.h>
#import "MBProgressHUD+Extend.h"
#import <MBProgressHUD/MBProgressHUD.h>

static NSTimeInterval defaultHideTime = 1.5f;

@implementation MBProgressHUD (Extend)

+ (void)showInfoTitle:(NSString *)title {
    [self showHUDMessage:title toView:nil afterDealy:0 stateType:HUDStateTypeText];
}
+ (void)showInfoTitle:(NSString *)title toView:(UIView *)view afterDealy:(NSTimeInterval)daely {
    [self showHUDMessage:title toView:view afterDealy:daely stateType:HUDStateTypeText];
}

+ (void)showLoadingHUD {
    [self showHUDMessage:@"加载中..." toView:nil afterDealy:30 stateType:HUDStateTypeLoading];
}
+ (void)showLoadingHUDMessage:(NSString *)message {
    [self showHUDMessage:message toView:nil afterDealy:30 stateType:HUDStateTypeLoading];
}

+ (void)showLoadingHUDMessage:(NSString *)message toView:(UIView *)view {
    [self showHUDMessage:message toView:view afterDealy:30 stateType:HUDStateTypeLoading];
}

+ (void)showLoadingHUDMessage:(NSString *)message toView:(UIView *)view afterDealy:(NSTimeInterval)dealy {
    [self showHUDMessage:message toView:view afterDealy:dealy stateType:HUDStateTypeLoading];
}

+ (void)showSuccessMessage:(NSString *)message {
    [self showHUDMessage:message toView:nil afterDealy:defaultHideTime stateType:HUDStateTypeSuccess];
}
+ (void)showSuccessMessage:(NSString *)message toView:(UIView *)view {
    [self showHUDMessage:message toView:view afterDealy:defaultHideTime stateType:HUDStateTypeSuccess];
}
+ (void)showSuccessMessage:(NSString *)message toView:(UIView *)view afterDealy:(NSTimeInterval)dealy {
    [self showHUDMessage:message toView:view afterDealy:dealy stateType:HUDStateTypeSuccess];
}

+ (void)showErrorMessage:(NSString *)message {
    [self showHUDMessage:message toView:nil afterDealy:defaultHideTime stateType:HUDStateTypeFail];
}
+ (void)showErrorMessage:(NSString *)message toView:(UIView *)view {
    [self showHUDMessage:message toView:view afterDealy:defaultHideTime stateType:HUDStateTypeFail];
}
+ (void)showErrorMessage:(NSString *)message toView:(UIView *)view afterDealy:(NSTimeInterval)dealy {
    [self showHUDMessage:message toView:view afterDealy:dealy stateType:HUDStateTypeFail];
}

+ (void)showWarringMessage:(NSString *)message {
    [self showHUDMessage:message toView:nil afterDealy:defaultHideTime stateType:HUDStateTypeWarning];
}
+ (void)showWarringMessage:(NSString *)message toView:(UIView *)view {
    [self showHUDMessage:message toView:view afterDealy:defaultHideTime stateType:HUDStateTypeWarning];
}
+ (void)showWarringMessage:(NSString *)message toView:(UIView *)view afterDealy:(NSTimeInterval)dealy {
    [self showHUDMessage:message toView:view afterDealy:dealy stateType:HUDStateTypeWarning];
}


#pragma mark - 显示所有样式的方法
+ (void)showHUDMessage:(NSString *)meaasge toView:(UIView *)view afterDealy:(NSTimeInterval)daely stateType:(HUDStateType)type {
    [self _willShowingToViewWithSourceView:view];
    if (!view) {
//        view = [[UIApplication sharedApplication].delegate window];
        view = [MBProgressHUD keyWindow];
    }
    MBProgressHUD *hud = [MBProgressHUD showHUDAddedTo:view animated:YES];
    
    NSString *imageName = @"";
    if (type == HUDStateTypeText) {
        hud.mode = MBProgressHUDModeText;
        hud.margin = 12;
    } else if (type == HUDStateTypeLoading) {
        hud.mode = MBProgressHUDModeIndeterminate;
    } else if (type == HUDStateTypeSuccess) {
        imageName = @"MBProgressHUD.bundle/success";
        hud.mode = MBProgressHUDModeCustomView;
    } else if (type == HUDStateTypeFail) {
        imageName = @"MBProgressHUD.bundle/error";
        hud.mode = MBProgressHUDModeCustomView;
    } else if (type == HUDStateTypeWarning) {
        imageName = @"MBProgressHUD.bundle/warning";
        hud.mode = MBProgressHUDModeCustomView;
    }
    hud.label.text = meaasge;
    hud.label.textColor = [UIColor whiteColor];
    hud.contentColor = [UIColor whiteColor];
    hud.label.numberOfLines = 0;
    hud.label.font = [UIFont systemFontOfSize:16];
    hud.margin = 15;
    hud.bezelView.color = [UIColor colorWithRed:0/255.0 green:0/255.0 blue:0/255.0 alpha:0.6];
    hud.bezelView.style = MBProgressHUDBackgroundStyleSolidColor;
    if (type == HUDStateTypeSuccess || type == HUDStateTypeFail || type == HUDStateTypeWarning) {
        hud.minSize = CGSizeMake(120, 120);
        hud.customView = [[UIImageView alloc]initWithImage:[UIImage imageNamed:imageName]];
        hud.mode = MBProgressHUDModeCustomView;
    }
    // 隐藏的时候从父控件中移除
    hud.removeFromSuperViewOnHide = YES;
    // 1.5秒之后再消失
    [hud hideAnimated:YES afterDelay:daely>0?daely:defaultHideTime];
}

#pragma mark - 辅助方法
/// 获取将要显示的view
+ (UIView *)_willShowingToViewWithSourceView:(UIView *)sourceView
{
    if (sourceView) return sourceView;
    
//    sourceView =  [[UIApplication sharedApplication].delegate window];
    if (!sourceView) {
        if (@available(iOS 13.0, *)) {
            return UIApplication.sharedApplication.windows.firstObject;
        } else {
            return UIApplication.sharedApplication.keyWindow;
        }
    }
    
    return sourceView;
}

+ (void)hidenHudFromView:(UIView *)view{
    if (view == nil) view = [self keyWindow];
    [MBProgressHUD hideHUDForView:view animated:YES];
}

+ (UIWindow *)keyWindow {
//    UIWindow *window = UIApplication.sharedApplication.delegate.window;
//    if (window) return window;
    if (@available(iOS 13.0, *)) {
        return UIApplication.sharedApplication.windows.firstObject;
    } else {
        return UIApplication.sharedApplication.keyWindow;
    }
}

+ (void)hidenHud{
    [self hidenHudFromView:nil];
}

@end
