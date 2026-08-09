import { Command } from '../commands/Command';

export class HistoryManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];
    private maxHistory = 50;

    push(command: Command): void {
        this.undoStack.push(command);
        // If we make a new action, the redo history is lost
        this.redoStack = [];
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift(); // Remove oldest
        }
    }

    popUndo(): Command | undefined {
        const command = this.undoStack.pop();
        if (command) {
            this.redoStack.push(command);
        }
        return command;
    }

    popRedo(): Command | undefined {
        const command = this.redoStack.pop();
        if (command) {
            this.undoStack.push(command);
        }
        return command;
    }
}
