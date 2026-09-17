package com.luckprinter.demo.dialog;

import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;

import com.luckjingle.printersdk.R;
import com.luckprinter.sdk_new.PrinterUtil;

import java.io.IOException;

public class PrintContinuousDialog {

    private final Context context;
    private TextView tvPhotoPath;
    private CheckBox cbGrayScale;
    private RadioGroup rgGrayScale;
    private EditText etCount;
    private EditText etWidth;
    private Uri imageUri;
    private Callback callback;

    public PrintContinuousDialog(@NonNull Context context) {
        this.context = context;
    }

    public void show() {
        View view = LayoutInflater.from(context).inflate(R.layout.layout_print_bitmap_continue, null);
        cbGrayScale = view.findViewById(R.id.cb_gray_scale);
        rgGrayScale = view.findViewById(R.id.rg_gray_scale);
        etCount = view.findViewById(R.id.et_content);
        etWidth = view.findViewById(R.id.et_width);
        tvPhotoPath = view.findViewById(R.id.tv_photo_path);
        LinearLayout selectPhoto = view.findViewById(R.id.llayout_select_photo);
        selectPhoto.setOnClickListener(v -> toSelectImage());

        cbGrayScale.setOnCheckedChangeListener((buttonView, isChecked) ->
                rgGrayScale.setVisibility(isChecked ? View.VISIBLE : View.GONE));
        rgGrayScale.setVisibility(cbGrayScale.isChecked() ? View.VISIBLE : View.GONE);

        new Ai50DialogHelper.Builder(context)
                .setTitle(R.string.demo_continuous_print_title)
                .setSubtitle(R.string.print_dialog_subtitle)
                .setContentView(view)
                .setOnConfirm(d -> toPrint())
                .show();
    }

    private void toSelectImage() {
        if (!(context instanceof ImageSelectHost)) {
            return;
        }
        ((ImageSelectHost) context).toSelectImage(uri -> {
            imageUri = uri;
            if (tvPhotoPath != null && uri != null) {
                tvPhotoPath.setText(context.getString(R.string.print_dialog_image_path, uri.getPath()));
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
            int grayScaleButtonId = rgGrayScale.getCheckedRadioButtonId();
            RadioButton radioButton = rgGrayScale.findViewById(grayScaleButtonId);
            int grayScale = Integer.parseInt(radioButton.getTag().toString());
            if (callback != null) {
                callback.printImg(bitmap, cbGrayScale.isChecked(), grayScale, count, widthMM);
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
        void printImg(Bitmap bitmap, boolean isGray, int grayScale, int count, Integer widthMM);
    }
}
