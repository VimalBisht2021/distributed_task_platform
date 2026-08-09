export const HelloWorldExecutor = async (config: any, context: any) => {
    const greeting = config.greeting || 'Hello, World!';
    const repeatCount = config.repeatCount || 1;
    
    const results = [];
    for (let i = 0; i < repeatCount; i++) {
        results.push(greeting);
    }
    
    return {
        success: true,
        message: results.join(' '),
        executionTime: new Date().toISOString()
    };
};
