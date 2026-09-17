//
//  MBProgressHUD+Extend.h
//  YGCD
//
//  Created by 阿米拉 on 2019/8/13.
//  Copyright © 2019年 林志强. All rights reserved.
//

#import "MBProgressHUD.h"

//NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, HUDStateType) {
    /// 显示为纯文本
    HUDStateTypeText,
    /// 显示为指示器
    HUDStateTypeLoading,
    /// 显示为成功状态
    HUDStateTypeSuccess,
    /// 显示为失败状态
    HUDStateTypeFail,
    /// 显示为警告状态
    HUDStateTypeWarning
};

@interface MBProgressHUD (Extend)

/**
 显示纯文本hud

 @param title 标题
 */
+ (void)showInfoTitle:(NSString *)title;
+ (void)showInfoTitle:(NSString *)title toView:(UIView *)view afterDealy:(NSTimeInterval)daely;

/**
 显示一个带菊花样式的hud
 */
+ (void)showLoadingHUD;
+ (void)showLoadingHUDMessage:(NSString *)message;
+ (void)showLoadingHUDMessage:(NSString *)message toView:(UIView *)view;
+ (void)showLoadingHUDMessage:(NSString *)message toView:(UIView *)view afterDealy:(NSTimeInterval)dealy;

/**
 显示一个成功logo样式的hud

 @param message 标题信息
 */
+ (void)showSuccessMessage:(NSString *)message;
+ (void)showSuccessMessage:(NSString *)message toView:(UIView *)view;
+ (void)showSuccessMessage:(NSString *)message toView:(UIView *)view afterDealy:(NSTimeInterval)dealy;
/**
 显示一个错误logo样式的hud
 
 @param message 标题信息
 */
+ (void)showErrorMessage:(NSString *)message;
+ (void)showErrorMessage:(NSString *)message toView:(UIView *)view;
+ (void)showErrorMessage:(NSString *)message toView:(UIView *)view afterDealy:(NSTimeInterval)dealy;
/**
 显示一个警告logo样式的hud
 
 @param message 标题信息
 */
+ (void)showWarringMessage:(NSString *)message;
+ (void)showWarringMessage:(NSString *)message toView:(UIView *)view;
+ (void)showWarringMessage:(NSString *)message toView:(UIView *)view afterDealy:(NSTimeInterval)dealy;
#pragma mark - 隐藏

/**
 移除自定视图 HUD
 
 @param view 视图
 */
+ (void)hidenHudFromView:(UIView *)view;
/**
 移除 HUD
 */
+ (void)hidenHud;


@end

//NS_ASSUME_NONNULL_END
