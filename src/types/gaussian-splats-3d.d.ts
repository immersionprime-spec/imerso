declare module '@mkkellogg/gaussian-splats-3d' {
  export const RenderMode: { Always: number; OnChange: number; Never: number };
  export class Viewer {
    constructor(options?: Record<string, unknown>);
    camera: {
      position: { set: (...args: number[]) => void; fromArray: (a: number[]) => void; toArray: () => number[] };
      lookAt: (...args: number[]) => void;
    };
    controls?: {
      target: {
        set: (...args: number[]) => void;
        fromArray: (a: number[]) => void;
        toArray: () => number[];
      };
      update?: () => void;
    };
    renderer?: { domElement: HTMLElement; setPixelRatio: (n: number) => void };
    start(): void;
    addSplatScene(path: string, options?: Record<string, unknown>): Promise<void>;
    removeSplatScene?(index: number, showLoadingUI?: boolean): Promise<void>;
    dispose(): Promise<void>;
  }
}
