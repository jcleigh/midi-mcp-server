"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const MidiService_js_1 = require("./services/MidiService.js");
const server = new index_js_1.Server({
    name: "midi-mcp-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
        resources: {},
        prompts: {},
    },
});
// MIDI Logs Resource Buffer
const midiLogs = [];
const MAX_LOGS = 100;
function logMidi(direction, port, data) {
    const timestamp = new Date().toISOString();
    const hex = data.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const log = `[${timestamp}] ${direction} ${port}: ${hex}`;
    midiLogs.unshift(log);
    if (midiLogs.length > MAX_LOGS)
        midiLogs.pop();
    // Also log to stderr for visibility in host logs
    console.error(log);
}
// Initialize MIDI Service
let midiService;
const connectedInputs = new Set();
async function getMidi() {
    if (!midiService) {
        midiService = await MidiService_js_1.MidiService.getInstance();
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
                }
                catch (e) {
                    console.error(`Failed to listen to ${port.name}:`, e);
                }
            }
        }
    }
    return midiService;
}
// --- Tools ---
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
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
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
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
            const args = request.params.arguments;
            if (!args.port || !args.tracks || args.tracks.length === 0) {
                throw new Error("Missing arguments: port and tracks are required");
            }
            const bpm = args.bpm ?? 120;
            const beatDuration = (60 / bpm) * 1000; // milliseconds per beat
            // Helper to convert note duration to milliseconds
            const getDuration = (duration) => {
                if (typeof duration === 'number')
                    return duration * beatDuration;
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
server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => {
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
server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
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
server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => {
    return {
        prompts: [
            {
                name: "midi_debug",
                description: "Help the user debug their MIDI setup",
            },
        ],
    };
});
server.setRequestHandler(types_js_1.GetPromptRequestSchema, async (request) => {
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
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("MIDI MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
