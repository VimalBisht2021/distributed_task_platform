import { HandlerLifecycle, HandlerContext } from '../../../runtime/context/handler-context';
import { ExecutionResult } from '../../../execution-contract/schemas/handler-definition';

export abstract class AbstractUtilityHandler<TInput, TOutput> implements HandlerLifecycle<TInput, TOutput> {
    
    abstract validate(input: TInput): Promise<boolean>;

    async prepare(context: HandlerContext): Promise<void> {
        // Utilities generally do not require heavy initialization
    }

    abstract execute(input: TInput, context: HandlerContext): Promise<ExecutionResult<TOutput>>;

    async cleanup(context: HandlerContext): Promise<void> {
        // Utilities generally do not require cleanup
    }
}
