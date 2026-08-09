import { create } from 'zustand';
import { BuilderState } from './builder-state';
import { Command } from '../commands/Command';
import { HistoryManager } from '../history/history-manager';

interface BuilderStore extends BuilderState {
    historyManager: HistoryManager;
    
    // Actions
    dispatch: (command: Command) => void;
    undo: () => void;
    redo: () => void;
    selectNode: (id: string | null) => void;
    setValidationErrors: (errors: any[]) => void;
}

const initialState: BuilderState = {
    nodes: [],
    edges: [],
    selectedNodeId: null,
    validationErrors: [],
};

export const useBuilderStore = create<BuilderStore>((set, get) => ({
    ...initialState,
    historyManager: new HistoryManager(),

    dispatch: (command: Command) => {
        set((state) => {
            const newState = command.execute(state);
            state.historyManager.push(command);
            return newState;
        });
    },
    
    undo: () => {
        set((state) => {
            const command = state.historyManager.popUndo();
            if (command) {
                return command.undo(state);
            }
            return state;
        });
    },

    redo: () => {
        set((state) => {
            const command = state.historyManager.popRedo();
            if (command) {
                return command.execute(state);
            }
            return state;
        });
    },

    selectNode: (id: string | null) => set({ selectedNodeId: id }),
    setValidationErrors: (errors: any[]) => set({ validationErrors: errors }),
}));
