// MCP server (stdio). Tools:
//   numguard_check  — check an answer against inline sources plus everything recorded for the session
//   numguard_record — store a tool output as a source for a session (in memory, lives as long as the server)
//   numguard_reset  — forget a session's recorded sources
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, callTool } from './tools.js';

export async function mcpMain() {
  const server = new Server({ name: 'numguard', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { text, isError } = callTool(req.params.name, req.params.arguments);
    return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
  });
  await server.connect(new StdioServerTransport());
}
