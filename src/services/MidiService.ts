import JZZ, { JZZApi, PortInfo } from 'jzz';

export interface MidiPort {
  id: string;
  name: string;
  type: 'input' | 'output';
}

export class MidiService {
  private static instance: MidiService;
  private jzz: JZZApi | null = null;
  private activeInputs: Map<string, any> = new Map();
  private activeOutputs: Map<string, any> = new Map();

  private constructor() {}

  static async getInstance(): Promise<MidiService> {
    if (!MidiService.instance) {
      MidiService.instance = new MidiService();
      await MidiService.instance.initialize();
    }
    return MidiService.instance;
  }

  private async initialize() {
    try {
      this.jzz = await JZZ();
      console.error('MIDI Subsystem Initialized');
    } catch (err) {
      console.error('Failed to initialize MIDI subsystem:', err);
      throw err;
    }
  }

  async listPorts(): Promise<MidiPort[]> {
    if (!this.jzz) await this.initialize();
    const info = this.jzz!.info();
    
    const inputs = info.inputs.map((p: PortInfo) => ({
      id: p.name, // JZZ uses name as ID often, or we can use ID if available. Let's use name for stability if unique.
      name: p.name,
      type: 'input' as const
    }));

    const outputs = info.outputs.map((p: PortInfo) => ({
      id: p.name,
      name: p.name,
      type: 'output' as const
    }));

    return [...inputs, ...outputs];
  }

  async sendMessage(portName: string, message: number[]) {
    if (!this.jzz) await this.initialize();

    let port = this.activeOutputs.get(portName);
    if (!port) {
      try {
        port = this.jzz!.openMidiOut(portName);
        this.activeOutputs.set(portName, port);
      } catch (e) {
        throw new Error(`Failed to open MIDI output port: ${portName}`);
      }
    }

    port.send(message);
  }

  async listen(portName: string, callback: (msg: number[]) => void) {
    if (!this.jzz) await this.initialize();

    let port = this.activeInputs.get(portName);
    if (!port) {
      try {
        port = this.jzz!.openMidiIn(portName);
        this.activeInputs.set(portName, port);
      } catch (e) {
        throw new Error(`Failed to open MIDI input port: ${portName}`);
      }
    }

    // JZZ connect passes a message object that can be treated as array
    port.connect((msg: any) => {
      // Convert to standard array if needed, JZZ messages are array-like
      const data = Array.from(msg) as number[];
      callback(data);
    });
  }
}
