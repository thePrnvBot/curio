import { MeshGradient, Shader } from "shaders/react";

const SHADER_STOPS = {
  dark: [
    { color: "#020617", position: 0 },
    { color: "#042f2e", position: 0.25 },
    { color: "#115e59", position: 0.5 },
    { color: "#0d9488", position: 0.72 },
    { color: "#34d399", position: 1 },
  ],
  light: [
    { color: "#ecfdf5", position: 0 },
    { color: "#ccfbf1", position: 0.3 },
    { color: "#99f6e4", position: 0.55 },
    { color: "#5eead4", position: 0.78 },
    { color: "#34d399", position: 1 },
  ],
} satisfies Record<string, { color: string; position: number }[]>;

/**
 * WebGPU hero background, split into its own chunk so the shader runtime is
 * never part of the shared route shell on chat/course pages.
 */
export default function LandingShader({ isLight }: { isLight: boolean }) {
  return (
    <Shader className="absolute inset-0" disableTelemetry>
      <MeshGradient
        colorSpace="oklab"
        count={4}
        drift={0.3}
        seed={7}
        smoothness={3.4}
        speed={0.25}
        stops={isLight ? SHADER_STOPS.light : SHADER_STOPS.dark}
        swirl={0.1}
        variation={0.2}
      />
    </Shader>
  );
}
