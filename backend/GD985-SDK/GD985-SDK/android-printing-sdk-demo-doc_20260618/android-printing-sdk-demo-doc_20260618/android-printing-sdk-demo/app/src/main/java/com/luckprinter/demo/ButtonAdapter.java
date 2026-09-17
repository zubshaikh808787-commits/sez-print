package com.luckprinter.demo;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.luckjingle.printersdk.R;
import com.luckprinter.demo.bean.ButtonItem;

import java.util.ArrayList;
import java.util.List;

public class ButtonAdapter extends RecyclerView.Adapter<ButtonAdapter.Holder> {
    private final List<ButtonItem> buttonList = new ArrayList<>();
    private ItemClickListener itemClickListener;

    public ButtonAdapter(List<ButtonItem> buttonList) {
        this.buttonList.addAll(buttonList);
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_ai50_action, parent, false);
        return new Holder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        ButtonItem item = buttonList.get(position);
        holder.bind(item);
        holder.itemView.setOnClickListener(v -> {
            if (itemClickListener != null) {
                itemClickListener.onItemClick(item);
            }
        });
    }

    @Override
    public int getItemCount() {
        return buttonList.size();
    }

    public void setItemClickListener(ItemClickListener itemClickListener) {
        this.itemClickListener = itemClickListener;
    }

    public interface ItemClickListener {
        void onItemClick(ButtonItem btn);
    }

    static class Holder extends RecyclerView.ViewHolder {
        private final TextView tvAction;

        Holder(@NonNull View itemView) {
            super(itemView);
            tvAction = itemView.findViewById(R.id.tv_action);
        }

        void bind(ButtonItem item) {
            tvAction.setText(item.getName());
        }
    }
}
