package com.luckprinter.demo.dialog;

import android.app.AlertDialog;
import android.content.Context;
import android.graphics.drawable.ColorDrawable;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.annotation.LayoutRes;
import androidx.annotation.StringRes;

import com.luckjingle.printersdk.R;

/**
 * AI50 统一弹窗样式
 */
public final class Ai50DialogHelper {

    public interface ConfirmListener {
        /**
         * @return true 关闭弹窗，false 保持打开
         */
        boolean onConfirm(AlertDialog dialog);
    }

    private Ai50DialogHelper() {
    }

    public static final class Builder {
        private final Context context;
        private CharSequence title;
        private CharSequence subtitle;
        private View contentView;
        private ConfirmListener confirmListener;
        private boolean cancelable = true;

        public Builder(Context context) {
            this.context = context;
        }

        public Builder setTitle(@StringRes int titleRes) {
            this.title = context.getString(titleRes);
            return this;
        }

        public Builder setTitle(CharSequence title) {
            this.title = title;
            return this;
        }

        public Builder setSubtitle(@StringRes int subtitleRes) {
            this.subtitle = context.getString(subtitleRes);
            return this;
        }

        public Builder setSubtitle(CharSequence subtitle) {
            this.subtitle = subtitle;
            return this;
        }

        public Builder setContentView(View contentView) {
            this.contentView = contentView;
            return this;
        }

        public Builder setContentView(@LayoutRes int layoutRes) {
            this.contentView = LayoutInflater.from(context).inflate(layoutRes, null);
            return this;
        }

        public Builder setOnConfirm(ConfirmListener confirmListener) {
            this.confirmListener = confirmListener;
            return this;
        }

        public Builder setOnConfirm(Runnable action) {
            this.confirmListener = dialog -> {
                action.run();
                return true;
            };
            return this;
        }

        public Builder setCancelable(boolean cancelable) {
            this.cancelable = cancelable;
            return this;
        }

        public AlertDialog show() {
            View shell = LayoutInflater.from(context).inflate(R.layout.dialog_ai50_shell, null);
            TextView tvTitle = shell.findViewById(R.id.tv_dialog_title);
            TextView tvSubtitle = shell.findViewById(R.id.tv_dialog_subtitle);
            FrameLayout flContent = shell.findViewById(R.id.fl_dialog_content);
            Button btnCancel = shell.findViewById(R.id.btn_dialog_cancel);
            Button btnConfirm = shell.findViewById(R.id.btn_dialog_confirm);

            tvTitle.setText(title);
            if (!TextUtils.isEmpty(subtitle)) {
                tvSubtitle.setText(subtitle);
                tvSubtitle.setVisibility(View.VISIBLE);
            }

            if (contentView != null) {
                flContent.addView(contentView);
            }

            AlertDialog dialog = new AlertDialog.Builder(context, R.style.Ai50DialogTheme)
                    .setView(shell)
                    .setCancelable(cancelable)
                    .create();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setBackgroundDrawable(new ColorDrawable(android.graphics.Color.TRANSPARENT));
            }

            btnCancel.setOnClickListener(v -> dialog.dismiss());
            btnConfirm.setOnClickListener(v -> {
                if (confirmListener == null || confirmListener.onConfirm(dialog)) {
                    dialog.dismiss();
                }
            });
            dialog.show();
            return dialog;
        }
    }
}
