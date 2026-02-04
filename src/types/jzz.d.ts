declare module 'jzz' {
  export interface MidiMessage extends Array<number> {}

  export interface PortInfo {
    id: string;
    name: string;
    manufacturer: string;
    version: string;
    engine: string;
  }

  export interface Port {
    send(msg: number[]): Port;
    close(): void;
    connect(callback: (msg: any) => void): Port;
    disconnect(): Port;
    name(): string;
  }

  export interface JZZApi {
    info(): {
      inputs: PortInfo[];
      outputs: PortInfo[];
    };
    openMidiIn(name: string | number): Port;
    openMidiOut(name: string | number): Port;
  }

  function JZZ(): Promise<JZZApi>;
  export default JZZ;
}
