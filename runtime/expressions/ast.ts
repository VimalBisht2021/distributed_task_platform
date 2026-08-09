export interface AstNode {
    type: string;
    [key: string]: any;
}

export interface CompiledExpression {
    id: string;
    source: string;
    ast: AstNode;
    variables: string[];
}
