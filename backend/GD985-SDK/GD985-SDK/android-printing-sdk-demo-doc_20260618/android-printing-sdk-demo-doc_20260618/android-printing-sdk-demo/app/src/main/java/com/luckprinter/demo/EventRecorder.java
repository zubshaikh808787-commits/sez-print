package com.luckprinter.demo;

import android.util.Log;

import com.luckprinter.sdk_new.client.IEventRecorder;

/**
 * @author HuangXiaohui
 * @date 2024-03-20 18:47
 */
public class EventRecorder implements IEventRecorder {
    public static final String TAG = "EventRecorder";
    @Override
    public void onEvent(String eventId, String eventDesc) {
        Log.d(TAG, String.format("%s", eventDesc));
    }
}
