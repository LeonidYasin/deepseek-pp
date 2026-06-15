#!/usr/bin/env node

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);
const app = express();
app.use(express.json({ limit: '50mb' }));

const WORKSPACE = process.env.WORKSPACE || '/workspace';

// Create workspace if not exists
await fs.mkdir(WORKSPACE, { recursive: true });

// Helper to execute commands
async function executeCommand(cmd, cwd = WORKSPACE, timeout = 30000) {
    try {
        const { stdout, stderr } = await execAsync(cmd, { 
            cwd, 
            timeout,
            shell: true,
            env: { ...process.env, PATH: process.env.PATH }
        });
        return { stdout, stderr, exitCode: 0 };
    } catch (error) {
        return { 
            stdout: error.stdout || '', 
            stderr: error.stderr || '', 
            exitCode: error.code || 1,
            message: error.message
        };
    }
}

// MCP Handlers
const handlers = {
    initialize: async () => ({
        protocolVersion: '0.1.0',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-universal-server', version: '2.0.0' }
    }),

    'tools/list': async () => ({
        tools: [
            {
                name: 'shell_exec',
                description: 'Execute any shell command',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string' },
                        cwd: { type: 'string' }
                    },
                    required: ['command']
                }
            },
            {
                name: 'python_exec',
                description: 'Execute Python script',
                inputSchema: {
                    type: 'object',
                    properties: {
                        script: { type: 'string' },
                        file: { type: 'string' }
                    }
                }
            },
            {
                name: 'gh_exec',
                description: 'Execute GitHub CLI command',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string' }
                    },
                    required: ['command']
                }
            },
            {
                name: 'fs_read',
                description: 'Read file',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'fs_write',
                description: 'Write file',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        content: { type: 'string' }
                    },
                    required: ['path', 'content']
                }
            },
            {
                name: 'fs_list',
                description: 'List directory',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' }
                    }
                }
            }
        ]
    }),

    'tools/call': async (params) => {
        const { name, arguments: args } = params;
        
        try {
            let result;
            
            switch(name) {
                case 'shell_exec':
                    const execResult = await executeCommand(args.command, args.cwd || WORKSPACE);
                    result = `STDOUT:\n${execResult.stdout}\nSTDERR:\n${execResult.stderr}\nExit code: ${execResult.exitCode}`;
                    break;
                    
                case 'python_exec':
                    let pythonCmd;
                    if (args.file) {
                        pythonCmd = `python3 ${args.file}`;
                    } else {
                        pythonCmd = `python3 -c "${args.script}"`;
                    }
                    const pyResult = await executeCommand(pythonCmd, WORKSPACE);
                    result = pyResult.stdout || pyResult.stderr;
                    break;
                    
                case 'gh_exec':
                    const ghResult = await executeCommand(`gh ${args.command}`, WORKSPACE);
                    result = ghResult.stdout || ghResult.stderr;
                    break;
                    
                case 'fs_read':
                    const fullPath = path.isAbsolute(args.path) ? args.path : path.join(WORKSPACE, args.path);
                    const content = await fs.readFile(fullPath, 'utf-8');
                    result = content;
                    break;
                    
                case 'fs_write':
                    const writePath = path.isAbsolute(args.path) ? args.path : path.join(WORKSPACE, args.path);
                    await fs.mkdir(path.dirname(writePath), { recursive: true });
                    await fs.writeFile(writePath, args.content, 'utf-8');
                    result = `Written to: ${writePath}`;
                    break;
                    
                case 'fs_list':
                    const listPath = args.path ? (path.isAbsolute(args.path) ? args.path : path.join(WORKSPACE, args.path)) : WORKSPACE;
                    const files = await fs.readdir(listPath);
                    const items = [];
                    for (const f of files) {
                        const stat = await fs.stat(path.join(listPath, f));
                        items.push(`${stat.isDirectory() ? '📁' : '📄'} ${f}`);
                    }
                    result = items.join('\n');
                    break;
                    
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            
            return { content: [{ type: 'text', text: result }] };
        } catch (error) {
            return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
        }
    }
};

app.post('/mcp', async (req, res) => {
    const { method, params, id } = req.body;
    console.log(`📨 ${method}`);
    
    try {
        if (handlers[method]) {
            const result = await handlers[method](params);
            res.json({ jsonrpc: '2.0', result, id });
        } else {
            throw new Error(`Unknown method: ${method}`);
        }
    } catch (error) {
        res.json({ jsonrpc: '2.0', error: { code: -32000, message: error.message }, id });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', workspace: WORKSPACE });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Universal MCP Server running on port ${PORT}`);
    console.log(`📁 Workspace: ${WORKSPACE}\n`);
});
