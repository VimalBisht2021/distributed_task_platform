import { BuilderState } from '../state/builder-state';

export interface Command {
    /**
     * Identifies the type of command (e.g., 'ADD_NODE', 'UPDATE_PROPERTY').
     * Useful for debugging or optimistic merging (if we wanted to batch typing events).
     */
    type: string;

    /**
     * Executes the command on the given state, returning a new state.
     */
    execute(state: BuilderState): BuilderState;

    /**
     * Reverts the command's effects, returning a new state.
     */
    undo(state: BuilderState): BuilderState;
}
