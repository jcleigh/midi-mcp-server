"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MidiService = void 0;
const jzz_1 = __importDefault(require("jzz"));
class MidiService {
    static instance;
    jzz = null;
    activeInputs = new Map();
    activeOutputs = new Map();
    constructor() { }
    static async getInstance() {
        if (!MidiService.instance) {
            MidiService.instance = new MidiService();
            await MidiService.instance.initialize();
        }
        return MidiService.instance;
    }
    async initialize() {
        try {
            this.jzz = await (0, jzz_1.default)();
            console.error('MIDI Subsystem Initialized');
        }
        catch (err) {
            console.error('Failed to initialize MIDI subsystem:', err);
            throw err;
        }
    }
    async listPorts() {
        if (!this.jzz)
            await this.initialize();
        const info = this.jzz.info();
        const inputs = info.inputs.map((p) => ({
            id: p.name, // JZZ uses name as ID often, or we can use ID if available. Let's use name for stability if unique.
            name: p.name,
            type: 'input'
        }));
        const outputs = info.outputs.map((p) => ({
            id: p.name,
            name: p.name,
            type: 'output'
        }));
        return [...inputs, ...outputs];
    }
    async sendMessage(portName, message) {
        if (!this.jzz)
            await this.initialize();
        let port = this.activeOutputs.get(portName);
        if (!port) {
            try {
                port = this.jzz.openMidiOut(portName);
                this.activeOutputs.set(portName, port);
            }
            catch (e) {
                throw new Error(`Failed to open MIDI output port: ${portName}`);
            }
        }
        port.send(message);
    }
    async listen(portName, callback) {
        if (!this.jzz)
            await this.initialize();
        let port = this.activeInputs.get(portName);
        if (!port) {
            try {
                port = this.jzz.openMidiIn(portName);
                this.activeInputs.set(portName, port);
            }
            catch (e) {
                throw new Error(`Failed to open MIDI input port: ${portName}`);
            }
        }
        // JZZ connect passes a message object that can be treated as array
        port.connect((msg) => {
            // Convert to standard array if needed, JZZ messages are array-like
            const data = Array.from(msg);
            callback(data);
        });
    }
}
exports.MidiService = MidiService;
