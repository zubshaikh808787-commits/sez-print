package com.luckprinter.demo.dialog;

import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;

import com.luckjingle.printersdk.R;
import com.luckprinter.sdk_new.PrinterUtil;

import java.io.IOException;

/**
 * AI50 连续纸打印弹窗（无灰阶选项，不影响原 Demo 弹窗）
 */
public class Ai50PrintContinuousDialog {

    private final Context context;
    private TextView tvPhotoPath;
    private EditText etCount;
    private EditText etWidth;
    private Uri imageUri;
    private Callback callback;

    public Ai50PrintContinuousDialog(@NonNull Context context) {
        this.context = context;
    }

    public void show() {
        View view = LayoutInflater.from(context).inflate(R.layout.layout_ai50_print_bitmap_continue, null);
        etCount = view.findViewById(R.id.et_content);
        etWidth = view.findViewById(R.id.et_width);
        tvPhotoPath = view.findViewById(R.id.tv_photo_path);
        LinearLayout selectPhoto = view.findViewById(R.id.llayout_select_photo);
        selectPhoto.setOnClickListener(v -> toSelectImage());

        new Ai50DialogHelper.Builder(context)
                .setTitle(R.string.action_print)
                .setSubtitle(R.string.print_dialog_subtitle)
                .setContentView(view)
                .setOnConfirm(d -> toPrint())
                .show();
    }

    private void toSelectImage() {
        if (!(context instanceof ImageSelectHost)) {
            return;
        }
        ((ImageSelectHost) context).toSelectImage(imageUri -> {
            Ai50PrintContinuousDialog.this.imageUri = imageUri;
            if (tvPhotoPath != null) {
                tvPhotoPath.setText(context.getString(R.string.print_dialog_image_path, imageUri.getPath()));
            }
        });
    }

    private boolean toPrint() {
        if (imageUri == null) {
            PrinterUtil.showToast(context.getString(R.string.error_select_image));
            return false;
        }
        int count = 1;
        try {
            count = Integer.parseInt(etCount.getText().toString());
        } catch (NumberFormatException ignored) {
        }
        if (count < 1) {
            count = 1;
        }

        Integer widthMM = null;
        try {
            widthMM = Integer.parseInt(etWidth.getText().toString());
        } catch (NumberFormatException ignored) {
        }

        ContentResolver resolver = context.getContentResolver();
        try {
            Bitmap bitmap = MediaStore.Images.Media.getBitmap(resolver, imageUri);
            if (callback != null) {
                callback.printImg(bitmap, count, widthMM);
            }
            return true;
        } catch (IOException e) {
            PrinterUtil.showToast(context.getString(R.string.error_image_load));
            return false;
        }
    }

    public void setCallback(Callback callback) {
        this.callback = callback;
    }

    public interface Callback {
        void printImg(Bitmap bitmap, int count, Integer widthMM);
    }
}
