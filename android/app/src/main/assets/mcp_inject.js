// MCP Bridge for DeepSeek WebView
(function() {
    if (window.mcpInitialized) return;
    window.mcpInitialized = true;
    
    // MCP Client
    class MCPClient {
        constructor() {
            this.requestId = 0;
            this.callbacks = new Map();
            this.setupCallbackHandler();
        }
        
        setupCallbackHandler() {
            window.__mcpCallback = (id, result, error) => {
                const callback = this.callbacks.get(id);
                if (callback) {
                    if (error) {
                        callback.reject(new Error(error));
                    } else {
                        try {
                            const data = JSON.parse(result);
                            callback.resolve(data);
                        } catch(e) {
                            callback.resolve(result);
                        }
                    }
                    this.callbacks.delete(id);
                }
            };
        }
        
        async call(method, params = {}) {
            const id = ++this.requestId;
            return new Promise((resolve, reject) => {
                this.callbacks.set(id, { resolve, reject });
                AndroidMCP.callMCP(method, JSON.stringify(params), id.toString());
            });
        }
        
        async listTools() {
            const result = await this.call('tools/list');
            return result.tools || [];
        }
        
        async callTool(name, args) {
            const result = await this.call('tools/call', { name, arguments: args });
            return result.content;
        }
    }
    
    window.mcp = new MCPClient();
    
    // Add console methods
    console.log('✅ MCP Client initialized');
    console.log('Available commands:');
    console.log('  await mcp.listTools() - List all tools');
    console.log('  await mcp.callTool("git_status", {repo: "deepseek-pp"}) - Call tool');
    
    // Auto-connect to MCP server
    setTimeout(async () => {
        try {
            const tools = await mcp.listTools();
            console.log(`📦 Loaded ${tools.length} MCP tools`);
            console.log(tools.map(t => `  - ${t.name}: ${t.description}`).join('\n'));
        } catch(e) {
            console.error('MCP connection failed:', e.message);
        }
    }, 2000);
})();
