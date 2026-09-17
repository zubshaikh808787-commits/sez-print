package com.luckprinter.demo.dialog;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;

import com.luckjingle.printersdk.R;

/**
 * Demo 弹窗基类，统一使用 AI50 弹窗样式
 */
public abstract class BaseDialog {
    private final Context context;
    private View view;

    public BaseDialog(Context context) {
        this.context = context;
        view = LayoutInflater.from(context).inflate(getLayoutId(), null);
        initView(view);
    }

    protected void initView(View view) {
    }

    protected void onSure() {
    }

    protected String getDialogTitle() {
        return "";
    }

    protected <T extends View> T findViewById(int id) {
        return view.findViewById(id);
    }

    public Context getContext() {
        return context;
    }

    protected abstract int getLayoutId();

    public void show() {
        new Ai50DialogHelper.Builder(context)
                .setTitle(getDialogTitle())
                .setContentView(view)
                .setOnConfirm(d -> {
                    onSure();
                    return true;
                })
                .show();
    }
}
