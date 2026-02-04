import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MidiService } from "./services/MidiService.js";

const server = new Server(
  {
    name: "midi-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// MIDI Logs Resource Buffer
const midiLogs: string[] = [];
const MAX_LOGS = 100;

function logMidi(direction: 'IN' | 'OUT', port: string, data: number[]) {
  const timestamp = new Date().toISOString();
  const hex = data.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const log = `[${timestamp}] ${direction} ${port}: ${hex}`;
  midiLogs.unshift(log);
  if (midiLogs.length > MAX_LOGS) midiLogs.pop();
  // Also log to stderr for visibility in host logs
  console.error(log);
}

// Initialize MIDI Service
let midiService: MidiService;
const connectedInputs = new Set<string>();

async function getMidi() {
  if (!midiService) {
    midiService = await MidiService.getInstance();
    
    // Auto-connect to all inputs for logging
    const ports = await midiService.listPorts();
    for (const port of ports) {
      if (port.type === 'input' && !connectedInputs.has(port.name)) {
        try {
          await midiService.listen(port.name, (data) => {
            logMidi('IN', port.name, data);
          });
          connectedInputs.add(port.name);
          console.error(`Listening to MIDI input: ${port.name}`);
        } catch (e) {
          console.error(`Failed to listen to ${port.name}:`, e);
        }
      }
    }
  }
  return midiService;
}

// --- Tools ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "midi_list_ports",
        description: "List available MIDI input and output ports.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "midi_send",
        description: "Send a MIDI message to a specific output port.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port to send to",
            },
            bytes: {
              type: "array",
              items: { type: "integer", minimum: 0, maximum: 255 },
              description: "The MIDI bytes to send (e.g. [144, 60, 100] for Note On)",
            },
          },
          required: ["port", "bytes"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const midi = await getMidi();

  switch (request.params.name) {
    case "midi_list_ports": {
      const ports = await midi.listPorts();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(ports, null, 2),
          },
        ],
      };
    }

    case "midi_send": {
      const args = request.params.arguments as { port: string; bytes: number[] };
      if (!args.port || !args.bytes) {
        throw new Error("Missing arguments: port and bytes are required");
      }
      
      await midi.sendMessage(args.port, args.bytes);
      logMidi('OUT', args.port, args.bytes);
      
      return {
        content: [
          {
            type: "text",
            text: `Sent MIDI message to ${args.port}`,
          },
        ],
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

// --- Resources ---

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "midi://logs",
        name: "Recent MIDI Logs",
        mimeType: "text/plain",
        description: "A log of the last 100 MIDI messages sent or received",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "midi://logs") {
    return {
      contents: [
        {
          uri: "midi://logs",
          mimeType: "text/plain",
          text: midiLogs.join("\n"),
        },
      ],
    };
  }
  throw new Error("Resource not found");
});

// --- Prompts ---

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "midi_debug",
        description: "Help the user debug their MIDI setup",
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === "midi_debug") {
    const midi = await getMidi();
    const ports = await midi.listPorts();
    const logs = midiLogs.slice(0, 10).join("\n");

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I need help debugging my MIDI setup. Here is the current state:
            
Available Ports:
${JSON.stringify(ports, null, 2)}

Recent Logs:
${logs}

Please analyze the ports and logs and tell me if anything looks wrong.`,
          },
        },
      ],
    };
  }
  throw new Error("Prompt not found");
});

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MIDI MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
