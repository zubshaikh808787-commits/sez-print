package com.luckprinter.demo;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.luckjingle.printersdk.R;

import java.util.List;

public class Ai50ActionAdapter extends RecyclerView.Adapter<Ai50ActionAdapter.Holder> {

    public interface ItemClickListener {
        void onItemClick(Ai50MenuTypeEnum action);
    }

    private final List<Ai50MenuTypeEnum> actions;
    private ItemClickListener itemClickListener;

    public Ai50ActionAdapter(List<Ai50MenuTypeEnum> actions) {
        this.actions = actions;
    }

    public void setItemClickListener(ItemClickListener itemClickListener) {
        this.itemClickListener = itemClickListener;
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
        Ai50MenuTypeEnum action = actions.get(position);
        holder.bind(action);
        holder.itemView.setOnClickListener(v -> {
            if (itemClickListener != null) {
                itemClickListener.onItemClick(action);
            }
        });
    }

    @Override
    public int getItemCount() {
        return actions.size();
    }

    static class Holder extends RecyclerView.ViewHolder {
        private final TextView tvAction;

        Holder(@NonNull View itemView) {
            super(itemView);
            tvAction = itemView.findViewById(R.id.tv_action);
        }

        void bind(Ai50MenuTypeEnum action) {
            tvAction.setText(itemView.getContext().getString(action.getLabelResId()));
        }
    }
}
