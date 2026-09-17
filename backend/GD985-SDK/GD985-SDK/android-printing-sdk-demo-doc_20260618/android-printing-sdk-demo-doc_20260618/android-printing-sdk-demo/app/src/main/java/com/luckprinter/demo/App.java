package com.luckprinter.demo;

import android.app.Application;
import android.util.Log;

import com.luckjingle.printersdk.BuildConfig;
import com.luckprinter.sdk_new.device.PrinterHelper;

public class App extends Application {
    public static final String TAG = "App";

    private static App instance = null;

    public static App getContext() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        String asKey = "";
        if(BuildConfig.FLAVOR.contains("abroad")) {
            //demo's asKey (out of china)
            asKey = "7fec7c4703824444a8bcf8b24b148dec";
        }else{
            //demo's asKey (in china)
            asKey = "91f047455bab4e94bc243b08326e607e";
        }
        //需要替换您的应用的asKey
        //You need to replace your app's asKey.
        //PrinterHelper.getInstance().setEnableBle(true);
        PrinterHelper.getInstance().init(this, asKey, BuildConfig.DEBUG);
        PrinterHelper.getInstance().setEventRecorder(new EventRecorder());
        OpenCVUtils.getInstance().initOpenCV(this, new OpenCVUtils.InitOpenCvCallback() {
            @Override
            public void onSuccess() {
                Log.d(TAG, "opencv init success");
            }

            @Override
            public void onError(int status) {
                Log.d(TAG, "opencv init error, status: " + status);
            }
        });
    }
}
