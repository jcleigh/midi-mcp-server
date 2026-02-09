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
        description: "Send a raw MIDI message to a specific output port.",
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
      {
        name: "midi_note_on",
        description: "Send a Note On message. Use this for manual control of notes. Notes will sustain until you send Note Off.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port",
            },
            note: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The MIDI note number (e.g., 60 = Middle C)",
            },
            velocity: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The note velocity (0-127, default: 64)",
            },
            channel: {
              type: "integer",
              minimum: 1,
              maximum: 16,
              description: "The MIDI channel (1-16, default: 1)",
            },
          },
          required: ["port", "note"],
        },
      },
      {
        name: "midi_note_off",
        description: "Send a Note Off message to stop a playing note.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port",
            },
            note: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The MIDI note number to stop",
            },
            velocity: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The release velocity (0-127, default: 64)",
            },
            channel: {
              type: "integer",
              minimum: 1,
              maximum: 16,
              description: "The MIDI channel (1-16, default: 1)",
            },
          },
          required: ["port", "note"],
        },
      },
      {
        name: "midi_play_note",
        description: "Play a note for a specified duration. This is non-blocking - multiple notes can play simultaneously.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port",
            },
            note: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The MIDI note number (e.g., 60 = Middle C)",
            },
            velocity: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The note velocity (0-127, default: 64)",
            },
            duration: {
              type: "integer",
              minimum: 1,
              description: "Duration in milliseconds (default: 500)",
            },
            channel: {
              type: "integer",
              minimum: 1,
              maximum: 16,
              description: "The MIDI channel (1-16, default: 1)",
            },
          },
          required: ["port", "note"],
        },
      },
      {
        name: "midi_control_change",
        description: "Send a Control Change (CC) message.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port",
            },
            controller: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The controller number (e.g., 1 = Mod Wheel, 7 = Volume, 64 = Sustain)",
            },
            value: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The controller value (0-127)",
            },
            channel: {
              type: "integer",
              minimum: 1,
              maximum: 16,
              description: "The MIDI channel (1-16, default: 1)",
            },
          },
          required: ["port", "controller", "value"],
        },
      },
      {
        name: "midi_program_change",
        description: "Send a Program Change message to select an instrument/preset.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port",
            },
            program: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The program number (0-127, instrument/preset)",
            },
            channel: {
              type: "integer",
              minimum: 1,
              maximum: 16,
              description: "The MIDI channel (1-16, default: 1)",
            },
          },
          required: ["port", "program"],
        },
      },
      {
        name: "midi_pitch_bend",
        description: "Send a Pitch Bend message.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port",
            },
            value: {
              type: "integer",
              minimum: -8192,
              maximum: 8191,
              description: "Pitch bend value (-8192 to 8191, 0 = no bend)",
            },
            channel: {
              type: "integer",
              minimum: 1,
              maximum: 16,
              description: "The MIDI channel (1-16, default: 1)",
            },
          },
          required: ["port", "value"],
        },
      },
      {
        name: "midi_play_sequence",
        description: "Play a sequence of notes one after another. Each note plays to completion before the next begins.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port",
            },
            notes: {
              type: "array",
              description: "Array of notes to play in sequence",
              items: {
                type: "object",
                properties: {
                  note: {
                    type: "integer",
                    minimum: 0,
                    maximum: 127,
                    description: "The MIDI note number (e.g., 60 = Middle C)",
                  },
                  velocity: {
                    type: "integer",
                    minimum: 0,
                    maximum: 127,
                    description: "The note velocity (0-127, default: 64)",
                  },
                  duration: {
                    type: "integer",
                    minimum: 1,
                    description: "Duration in milliseconds (default: 500)",
                  },
                },
                required: ["note"],
              },
            },
            channel: {
              type: "integer",
              minimum: 1,
              maximum: 16,
              description: "The MIDI channel (1-16, default: 1)",
            },
          },
          required: ["port", "notes"],
        },
      },
      {
        name: "midi_play_chord",
        description: "Play multiple notes simultaneously as a chord.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The name of the MIDI output port",
            },
            notes: {
              type: "array",
              description: "Array of MIDI note numbers to play together",
              items: {
                type: "integer",
                minimum: 0,
                maximum: 127,
              },
            },
            velocity: {
              type: "integer",
              minimum: 0,
              maximum: 127,
              description: "The velocity for all notes (0-127, default: 64)",
            },
            duration: {
              type: "integer",
              minimum: 1,
              description: "Duration in milliseconds (default: 500)",
            },
            channel: {
              type: "integer",
              minimum: 1,
              maximum: 16,
              description: "The MIDI channel (1-16, default: 1)",
            },
          },
          required: ["port", "notes"],
        },
      },
      {
        name: "midi_play_song",
        description: "Play a complete song with multiple tracks/channels in parallel, using musical timing (BPM and note values). Supports CC automation and pattern loops. Each track can be sent to a different MIDI port.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "string",
              description: "The default MIDI output port for all tracks (can be overridden per track)",
            },
            bpm: {
              type: "number",
              minimum: 20,
              maximum: 300,
              description: "Beats per minute (default: 120)",
            },
            tracks: {
              type: "array",
              description: "Array of tracks to play simultaneously",
              items: {
                type: "object",
                properties: {
                  port: {
                    type: "string",
                    description: "MIDI output port for this specific track (optional, defaults to main port)",
                  },
                  channel: {
                    type: "integer",
                    minimum: 1,
                    maximum: 16,
                    description: "MIDI channel for this track (default: 1)",
                  },
                  instrument: {
                    type: "integer",
                    minimum: 0,
                    maximum: 127,
                    description: "Program change/instrument number (optional)",
                  },
                  loop: {
                    type: "integer",
                    minimum: 1,
                    description: "Number of times to loop this track (default: 1)",
                  },
                  notes: {
                    type: "array",
                    description: "Notes with musical timing",
                    items: {
                      type: "object",
                      properties: {
                        note: {
                          description: "Note number(s). Single number or array for chords",
                        },
                        duration: {
                          type: "string",
                          description: "Note duration: 'whole', 'half', 'quarter', 'eighth', 'sixteenth', or number in beats",
                        },
                        velocity: {
                          type: "integer",
                          minimum: 0,
                          maximum: 127,
                          description: "Note velocity (default: 64)",
                        },
                        cc: {
                          type: "object",
                          description: "CC changes at this position",
                          properties: {
                            controller: {
                              type: "integer",
                              minimum: 0,
                              maximum: 127,
                            },
                            value: {
                              type: "integer",
                              minimum: 0,
                              maximum: 127,
                            },
                          },
                        },
                      },
                      required: ["note", "duration"],
                    },
                  },
                },
                required: ["notes"],
              },
            },
          },
          required: ["port", "tracks"],
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

    case "midi_note_on": {
      const args = request.params.arguments as { 
        port: string; 
        note: number; 
        velocity?: number;
        channel?: number;
      };
      if (!args.port || args.note === undefined) {
        throw new Error("Missing arguments: port and note are required");
      }
      
      const velocity = args.velocity ?? 64;
      const channel = (args.channel ?? 1) - 1; // Convert 1-16 to 0-15
      const statusByte = 0x90 + channel; // Note On
      const message = [statusByte, args.note, velocity];
      
      await midi.sendMessage(args.port, message);
      logMidi('OUT', args.port, message);
      
      return {
        content: [
          {
            type: "text",
            text: `Note On: note ${args.note}, velocity ${velocity}, channel ${channel + 1}`,
          },
        ],
      };
    }

    case "midi_note_off": {
      const args = request.params.arguments as { 
        port: string; 
        note: number; 
        velocity?: number;
        channel?: number;
      };
      if (!args.port || args.note === undefined) {
        throw new Error("Missing arguments: port and note are required");
      }
      
      const velocity = args.velocity ?? 64;
      const channel = (args.channel ?? 1) - 1; // Convert 1-16 to 0-15
      const statusByte = 0x80 + channel; // Note Off
      const message = [statusByte, args.note, velocity];
      
      await midi.sendMessage(args.port, message);
      logMidi('OUT', args.port, message);
      
      return {
        content: [
          {
            type: "text",
            text: `Note Off: note ${args.note}, velocity ${velocity}, channel ${channel + 1}`,
          },
        ],
      };
    }

    case "midi_play_note": {
      const args = request.params.arguments as { 
        port: string; 
        note: number; 
        velocity?: number;
        duration?: number;
        channel?: number;
      };
      if (!args.port || args.note === undefined) {
        throw new Error("Missing arguments: port and note are required");
      }
      
      const velocity = args.velocity ?? 64;
      const duration = args.duration ?? 500;
      const channel = (args.channel ?? 1) - 1; // Convert 1-16 to 0-15
      
      // Send Note On immediately
      const noteOnStatus = 0x90 + channel;
      const noteOnMessage = [noteOnStatus, args.note, velocity];
      await midi.sendMessage(args.port, noteOnMessage);
      logMidi('OUT', args.port, noteOnMessage);
      
      // Schedule Note Off (non-blocking)
      setTimeout(async () => {
        const noteOffStatus = 0x80 + channel;
        const noteOffMessage = [noteOffStatus, args.note, velocity];
        await midi.sendMessage(args.port, noteOffMessage);
        logMidi('OUT', args.port, noteOffMessage);
      }, duration);
      
      return {
        content: [
          {
            type: "text",
            text: `Playing note ${args.note} for ${duration}ms (velocity ${velocity}, channel ${channel + 1})`,
          },
        ],
      };
    }

    case "midi_control_change": {
      const args = request.params.arguments as { 
        port: string; 
        controller: number; 
        value: number;
        channel?: number;
      };
      if (!args.port || args.controller === undefined || args.value === undefined) {
        throw new Error("Missing arguments: port, controller, and value are required");
      }
      
      const channel = (args.channel ?? 1) - 1; // Convert 1-16 to 0-15
      const statusByte = 0xB0 + channel; // Control Change
      const message = [statusByte, args.controller, args.value];
      
      await midi.sendMessage(args.port, message);
      logMidi('OUT', args.port, message);
      
      return {
        content: [
          {
            type: "text",
            text: `CC: controller ${args.controller}, value ${args.value}, channel ${channel + 1}`,
          },
        ],
      };
    }

    case "midi_program_change": {
      const args = request.params.arguments as { 
        port: string; 
        program: number;
        channel?: number;
      };
      if (!args.port || args.program === undefined) {
        throw new Error("Missing arguments: port and program are required");
      }
      
      const channel = (args.channel ?? 1) - 1; // Convert 1-16 to 0-15
      const statusByte = 0xC0 + channel; // Program Change
      const message = [statusByte, args.program];
      
      await midi.sendMessage(args.port, message);
      logMidi('OUT', args.port, message);
      
      return {
        content: [
          {
            type: "text",
            text: `Program Change: program ${args.program}, channel ${channel + 1}`,
          },
        ],
      };
    }

    case "midi_pitch_bend": {
      const args = request.params.arguments as { 
        port: string; 
        value: number;
        channel?: number;
      };
      if (!args.port || args.value === undefined) {
        throw new Error("Missing arguments: port and value are required");
      }
      
      const channel = (args.channel ?? 1) - 1; // Convert 1-16 to 0-15
      // Convert -8192 to 8191 range to 0-16383 MIDI range
      const bendValue = args.value + 8192;
      const lsb = bendValue & 0x7F; // Lower 7 bits
      const msb = (bendValue >> 7) & 0x7F; // Upper 7 bits
      const statusByte = 0xE0 + channel; // Pitch Bend
      const message = [statusByte, lsb, msb];
      
      await midi.sendMessage(args.port, message);
      logMidi('OUT', args.port, message);
      
      return {
        content: [
          {
            type: "text",
            text: `Pitch Bend: ${args.value}, channel ${channel + 1}`,
          },
        ],
      };
    }

    case "midi_play_sequence": {
      const args = request.params.arguments as {
        port: string;
        notes: Array<{ note: number; velocity?: number; duration?: number }>;
        channel?: number;
      };
      if (!args.port || !args.notes || args.notes.length === 0) {
        throw new Error("Missing arguments: port and notes are required");
      }

      const channel = (args.channel ?? 1) - 1; // Convert 1-16 to 0-15
      const noteOnStatus = 0x90 + channel;
      const noteOffStatus = 0x80 + channel;

      // Play notes sequentially using a promise chain
      let totalDuration = 0;
      for (const noteInfo of args.notes) {
        const velocity = noteInfo.velocity ?? 64;
        const duration = noteInfo.duration ?? 500;

        // Send Note On immediately
        const noteOnMessage = [noteOnStatus, noteInfo.note, velocity];
        await midi.sendMessage(args.port, noteOnMessage);
        logMidi('OUT', args.port, noteOnMessage);

        // Wait for the duration
        await new Promise(resolve => setTimeout(resolve, duration));

        // Send Note Off
        const noteOffMessage = [noteOffStatus, noteInfo.note, velocity];
        await midi.sendMessage(args.port, noteOffMessage);
        logMidi('OUT', args.port, noteOffMessage);

        totalDuration += duration;
      }

      return {
        content: [
          {
            type: "text",
            text: `Played sequence of ${args.notes.length} notes (${totalDuration}ms total) on channel ${channel + 1}`,
          },
        ],
      };
    }

    case "midi_play_chord": {
      const args = request.params.arguments as {
        port: string;
        notes: number[];
        velocity?: number;
        duration?: number;
        channel?: number;
      };
      if (!args.port || !args.notes || args.notes.length === 0) {
        throw new Error("Missing arguments: port and notes are required");
      }

      const channel = (args.channel ?? 1) - 1;
      const velocity = args.velocity ?? 64;
      const duration = args.duration ?? 500;
      const noteOnStatus = 0x90 + channel;
      const noteOffStatus = 0x80 + channel;

      // Send all note-ons
      for (const note of args.notes) {
        const noteOnMessage = [noteOnStatus, note, velocity];
        await midi.sendMessage(args.port, noteOnMessage);
        logMidi('OUT', args.port, noteOnMessage);
      }

      // Wait for duration
      await new Promise(resolve => setTimeout(resolve, duration));

      // Send all note-offs
      for (const note of args.notes) {
        const noteOffMessage = [noteOffStatus, note, velocity];
        await midi.sendMessage(args.port, noteOffMessage);
        logMidi('OUT', args.port, noteOffMessage);
      }

      return {
        content: [
          {
            type: "text",
            text: `Played chord with ${args.notes.length} notes for ${duration}ms on channel ${channel + 1}`,
          },
        ],
      };
    }

    case "midi_play_song": {
      const args = request.params.arguments as {
        port: string;
        bpm?: number;
        tracks: Array<{
          port?: string;
          channel?: number;
          instrument?: number;
          loop?: number;
          notes: Array<{
            note: number | number[];
            duration: string | number;
            velocity?: number;
            cc?: { controller: number; value: number };
          }>;
        }>;
      };
      if (!args.port || !args.tracks || args.tracks.length === 0) {
        throw new Error("Missing arguments: port and tracks are required");
      }

      const bpm = args.bpm ?? 120;
      const beatDuration = (60 / bpm) * 1000; // milliseconds per beat

      // Helper to convert note duration to milliseconds
      const getDuration = (duration: string | number): number => {
        if (typeof duration === 'number') return duration * beatDuration;
        switch (duration) {
          case 'whole': return beatDuration * 4;
          case 'half': return beatDuration * 2;
          case 'quarter': return beatDuration;
          case 'eighth': return beatDuration / 2;
          case 'sixteenth': return beatDuration / 4;
          default: return beatDuration;
        }
      };

      // Play all tracks in parallel
      const trackPromises = args.tracks.map(async (track) => {
        const trackPort = track.port ?? args.port; // Use track-specific port or default
        const channel = (track.channel ?? 1) - 1;
        const loops = track.loop ?? 1;
        
        // Send program change if instrument specified
        if (track.instrument !== undefined) {
          const programChange = [0xC0 + channel, track.instrument];
          await midi.sendMessage(trackPort, programChange);
          logMidi('OUT', trackPort, programChange);
        }

        // Loop the track
        for (let loop = 0; loop < loops; loop++) {
          for (const noteEvent of track.notes) {
            const velocity = noteEvent.velocity ?? 64;
            const duration = getDuration(noteEvent.duration);
            const notes = Array.isArray(noteEvent.note) ? noteEvent.note : [noteEvent.note];
            
            // Send CC if specified
            if (noteEvent.cc) {
              const ccMessage = [0xB0 + channel, noteEvent.cc.controller, noteEvent.cc.value];
              await midi.sendMessage(trackPort, ccMessage);
              logMidi('OUT', trackPort, ccMessage);
            }

            // Send note-ons for all notes (chord support)
            const noteOnStatus = 0x90 + channel;
            for (const note of notes) {
              const noteOnMessage = [noteOnStatus, note, velocity];
              await midi.sendMessage(trackPort, noteOnMessage);
              logMidi('OUT', trackPort, noteOnMessage);
            }

            // Wait for duration
            await new Promise(resolve => setTimeout(resolve, duration));

            // Send note-offs
            const noteOffStatus = 0x80 + channel;
            for (const note of notes) {
              const noteOffMessage = [noteOffStatus, note, velocity];
              await midi.sendMessage(trackPort, noteOffMessage);
              logMidi('OUT', trackPort, noteOffMessage);
            }
          }
        }
      });

      await Promise.all(trackPromises);

      return {
        content: [
          {
            type: "text",
            text: `Played song with ${args.tracks.length} tracks at ${bpm} BPM`,
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
      {
        uri: "midi://ports",
        name: "Available MIDI Ports",
        mimeType: "application/json",
        description: "List of all available MIDI input and output ports",
      },
      {
        uri: "midi://reference/notes",
        name: "MIDI Note Reference",
        mimeType: "application/json",
        description: "Reference table of MIDI note numbers to musical notes",
      },
      {
        uri: "midi://reference/controllers",
        name: "MIDI Controller Reference",
        mimeType: "application/json",
        description: "Reference table of common MIDI control change (CC) numbers",
      },
      {
        uri: "midi://reference/general-midi",
        name: "General MIDI Instrument List",
        mimeType: "application/json",
        description: "List of General MIDI program numbers and instrument names",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  
  if (uri === "midi://logs") {
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
  
  if (uri === "midi://ports") {
    const midi = await getMidi();
    const ports = await midi.listPorts();
    return {
      contents: [
        {
          uri: "midi://ports",
          mimeType: "application/json",
          text: JSON.stringify(ports, null, 2),
        },
      ],
    };
  }
  
  if (uri === "midi://reference/notes") {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const notes = Array.from({ length: 128 }, (_, i) => ({
      number: i,
      name: `${noteNames[i % 12]}${Math.floor(i / 12) - 1}`,
      frequency: Math.round(440 * Math.pow(2, (i - 69) / 12) * 100) / 100,
    }));
    return {
      contents: [
        {
          uri: "midi://reference/notes",
          mimeType: "application/json",
          text: JSON.stringify(notes, null, 2),
        },
      ],
    };
  }
  
  if (uri === "midi://reference/controllers") {
    const controllers = {
      0: "Bank Select (MSB)",
      1: "Modulation Wheel",
      2: "Breath Controller",
      4: "Foot Controller",
      5: "Portamento Time",
      6: "Data Entry (MSB)",
      7: "Channel Volume",
      8: "Balance",
      10: "Pan",
      11: "Expression Controller",
      12: "Effect Control 1",
      13: "Effect Control 2",
      64: "Sustain Pedal (Damper)",
      65: "Portamento On/Off",
      66: "Sostenuto",
      67: "Soft Pedal",
      68: "Legato Footswitch",
      69: "Hold 2",
      70: "Sound Controller 1 (Sound Variation)",
      71: "Sound Controller 2 (Timbre/Harmonic Content)",
      72: "Sound Controller 3 (Release Time)",
      73: "Sound Controller 4 (Attack Time)",
      74: "Sound Controller 5 (Brightness)",
      84: "Portamento Control",
      91: "Effects 1 Depth (Reverb)",
      92: "Effects 2 Depth (Tremolo)",
      93: "Effects 3 Depth (Chorus)",
      94: "Effects 4 Depth (Detune)",
      95: "Effects 5 Depth (Phaser)",
      96: "Data Increment",
      97: "Data Decrement",
      120: "All Sound Off",
      121: "Reset All Controllers",
      122: "Local Control On/Off",
      123: "All Notes Off",
      124: "Omni Mode Off",
      125: "Omni Mode On",
      126: "Mono Mode On",
      127: "Poly Mode On",
    };
    return {
      contents: [
        {
          uri: "midi://reference/controllers",
          mimeType: "application/json",
          text: JSON.stringify(controllers, null, 2),
        },
      ],
    };
  }
  
  if (uri === "midi://reference/general-midi") {
    const instruments = {
      // Piano
      0: "Acoustic Grand Piano", 1: "Bright Acoustic Piano", 2: "Electric Grand Piano", 3: "Honky-tonk Piano",
      4: "Electric Piano 1", 5: "Electric Piano 2", 6: "Harpsichord", 7: "Clavinet",
      // Chromatic Percussion
      8: "Celesta", 9: "Glockenspiel", 10: "Music Box", 11: "Vibraphone",
      12: "Marimba", 13: "Xylophone", 14: "Tubular Bells", 15: "Dulcimer",
      // Organ
      16: "Drawbar Organ", 17: "Percussive Organ", 18: "Rock Organ", 19: "Church Organ",
      20: "Reed Organ", 21: "Accordion", 22: "Harmonica", 23: "Tango Accordion",
      // Guitar
      24: "Acoustic Guitar (nylon)", 25: "Acoustic Guitar (steel)", 26: "Electric Guitar (jazz)", 27: "Electric Guitar (clean)",
      28: "Electric Guitar (muted)", 29: "Overdriven Guitar", 30: "Distortion Guitar", 31: "Guitar Harmonics",
      // Bass
      32: "Acoustic Bass", 33: "Electric Bass (finger)", 34: "Electric Bass (pick)", 35: "Fretless Bass",
      36: "Slap Bass 1", 37: "Slap Bass 2", 38: "Synth Bass 1", 39: "Synth Bass 2",
      // Strings
      40: "Violin", 41: "Viola", 42: "Cello", 43: "Contrabass",
      44: "Tremolo Strings", 45: "Pizzicato Strings", 46: "Orchestral Harp", 47: "Timpani",
      // Ensemble
      48: "String Ensemble 1", 49: "String Ensemble 2", 50: "Synth Strings 1", 51: "Synth Strings 2",
      52: "Choir Aahs", 53: "Voice Oohs", 54: "Synth Voice", 55: "Orchestra Hit",
      // Brass
      56: "Trumpet", 57: "Trombone", 58: "Tuba", 59: "Muted Trumpet",
      60: "French Horn", 61: "Brass Section", 62: "Synth Brass 1", 63: "Synth Brass 2",
      // Reed
      64: "Soprano Sax", 65: "Alto Sax", 66: "Tenor Sax", 67: "Baritone Sax",
      68: "Oboe", 69: "English Horn", 70: "Bassoon", 71: "Clarinet",
      // Pipe
      72: "Piccolo", 73: "Flute", 74: "Recorder", 75: "Pan Flute",
      76: "Blown Bottle", 77: "Shakuhachi", 78: "Whistle", 79: "Ocarina",
      // Synth Lead
      80: "Lead 1 (square)", 81: "Lead 2 (sawtooth)", 82: "Lead 3 (calliope)", 83: "Lead 4 (chiff)",
      84: "Lead 5 (charang)", 85: "Lead 6 (voice)", 86: "Lead 7 (fifths)", 87: "Lead 8 (bass + lead)",
      // Synth Pad
      88: "Pad 1 (new age)", 89: "Pad 2 (warm)", 90: "Pad 3 (polysynth)", 91: "Pad 4 (choir)",
      92: "Pad 5 (bowed)", 93: "Pad 6 (metallic)", 94: "Pad 7 (halo)", 95: "Pad 8 (sweep)",
      // Synth Effects
      96: "FX 1 (rain)", 97: "FX 2 (soundtrack)", 98: "FX 3 (crystal)", 99: "FX 4 (atmosphere)",
      100: "FX 5 (brightness)", 101: "FX 6 (goblins)", 102: "FX 7 (echoes)", 103: "FX 8 (sci-fi)",
      // Ethnic
      104: "Sitar", 105: "Banjo", 106: "Shamisen", 107: "Koto",
      108: "Kalimba", 109: "Bag pipe", 110: "Fiddle", 111: "Shanai",
      // Percussive
      112: "Tinkle Bell", 113: "Agogo", 114: "Steel Drums", 115: "Woodblock",
      116: "Taiko Drum", 117: "Melodic Tom", 118: "Synth Drum", 119: "Reverse Cymbal",
      // Sound Effects
      120: "Guitar Fret Noise", 121: "Breath Noise", 122: "Seashore", 123: "Bird Tweet",
      124: "Telephone Ring", 125: "Helicopter", 126: "Applause", 127: "Gunshot",
    };
    return {
      contents: [
        {
          uri: "midi://reference/general-midi",
          mimeType: "application/json",
          text: JSON.stringify(instruments, null, 2),
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
