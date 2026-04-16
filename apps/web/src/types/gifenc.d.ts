declare module "gifenc" {
  export interface GifEncoder {
    writeFrame: (
      indexed: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        first?: boolean;
        dispose?: number;
      },
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GifEncoder;
  export function quantize(
    rgba: Uint8ClampedArray | Uint8Array,
    maxColors: number,
    opts?: { format?: "rgb444" | "rgb565" | "rgba4444"; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number },
  ): number[][];
  export function applyPalette(
    rgba: Uint8ClampedArray | Uint8Array,
    palette: number[][],
    format?: "rgb444" | "rgb565" | "rgba4444",
  ): Uint8Array;
}
